import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { edgeAllowedOrigins } from '../_shared/edge-origins.ts'
import { configuredProvider, generateValidated } from '../_shared/phase13-ai.ts'
import { cipherSchema, deliveryError, integrationKey, limitedJson, openSecret, SafeError, sealSecret, signature, validateEndpoint } from '../_shared/phase13-security.ts'

const guid = z.guid()
const eventTypes = ['work.created', 'work.completed', 'work.status_changed', 'deliverable.published_to_client', 'review.changes_requested', 'automation.manual'] as const
const requestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('configureIntegration'), projectId: guid, name: z.string().trim().min(1).max(120), key: guid,
    connectionId: guid.optional(), endpoint: z.string().max(2048), secret: z.string().min(32).max(512), consent: z.literal(true), eventTypes: z.array(z.enum(eventTypes)).min(1).max(6).default([...eventTypes]) }).strict(),
  z.object({ operation: z.literal('testIntegration'), connectionId: guid, key: guid, confirmSend: z.literal(true) }).strict(),
  z.object({ operation: z.literal('runAutomation'), automationId: guid, key: guid }).strict(),
  z.object({ operation: z.literal('retryAutomation'), runId: guid }).strict(),
  z.object({ operation: z.literal('generateAI'), projectId: guid, task: z.enum(['project_summary', 'draft_work']), input: z.string().max(2000), key: guid, consent: z.literal(true) }).strict(),
  z.object({ operation: z.literal('dispatch') }).strict(),
])
const allowedOrigins = edgeAllowedOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'),Deno.env.get('SUPABASE_URL'))
function headers(origin: string | null) {
  return { 'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', Vary: 'Origin' }
}
function json(value: unknown, status: number, origin: string | null) { return Response.json(value, { status, headers: headers(origin) }) }
function envKey(modern: string, legacy: string) {
  const raw = Deno.env.get(modern)
  if (raw) { try { return JSON.parse(raw).default as string } catch { throw new SafeError('configuration_missing', 503) } }
  const fallback = Deno.env.get(legacy)
  if (!fallback) throw new SafeError('configuration_missing', 503)
  return fallback
}
function clients(authorization: string | null) {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new SafeError('configuration_missing', 503)
  return {
    user: createClient(url, envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization ?? '' } }, auth: { persistSession: false } }),
    admin: createClient(url, envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
  }
}
type Client = ReturnType<typeof clients>['admin']
const knownErrors = new Set(['rate_limited', 'concurrency_limited', 'consent_required', 'automation_disabled', 'retry_not_allowed', 'idempotency_conflict'])
async function rpc(client: Client, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) {
    if (knownErrors.has(error.message)) throw new SafeError(error.message, error.code === '54000' ? 429 : error.code === '42501' ? 403 : 400)
    if (error.code === '42501') throw new SafeError('unauthorized', 403)
    throw new SafeError('invalid_configuration', 400)
  }
  return data
}
async function endpoint(raw: string) {
  return validateEndpoint(raw, {
    origins: (Deno.env.get('WEBHOOK_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
    allowLocalHttp: Deno.env.get('PHASE13_ALLOW_LOCAL_HTTP') === 'true' && Deno.env.get('PHASE13_LOCAL_TEST_ONLY') === 'true'
      && ['kong','localhost','127.0.0.1'].includes(new URL(Deno.env.get('SUPABASE_URL') ?? 'https://invalid').hostname),
    trustedEndpoints: (Deno.env.get('WEBHOOK_TRUSTED_ENDPOINTS') ?? '').split(',').map(value=>value.trim()).filter(Boolean),
    resolve: async hostname => {
      if (/^[0-9.]+$/.test(hostname) || hostname.includes(':')) return [hostname.replace(/[\[\]]/g, '')]
      const results = await Promise.allSettled([Deno.resolveDns(hostname, 'A'), Deno.resolveDns(hostname, 'AAAA')])
      return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    },
  })
}
function keyOptions() { return { keyring:Deno.env.get('INTEGRATION_ENCRYPTION_KEYS'),legacy:Deno.env.get('INTEGRATION_ENCRYPTION_KEY'),activeVersion:Deno.env.get('INTEGRATION_ACTIVE_KEY_VERSION') } }
async function sendDelivery(admin: Client, deliveryId: string, args: Record<string, unknown>) {
  const material = await rpc(admin, 'phase13_delivery_material', { p_delivery: deliveryId, ...args })
  let status: number | null = null
  let error: string | null = null
  try {
    const url = await endpoint(material.url)
    const {key} = await integrationKey(keyOptions(),cipherSchema.parse(material.cipher).key_version)
    const secret = await openSecret(material.cipher, material.connection_id, key)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const body = JSON.stringify(material.payload)
    const response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000), body,
      headers: { 'content-type': 'application/json', 'x-omnia-event-id': material.payload.event_id, 'x-omnia-delivery-id': deliveryId,
        'idempotency-key': deliveryId, 'x-omnia-timestamp': timestamp, 'x-omnia-signature': await signature(secret, timestamp, deliveryId, body) } })
    status = response.status
    error = deliveryError(status)
    await response.body?.cancel()
  } catch (caught) { error = caught instanceof SafeError ? caught.code : 'network_timeout' }
  await rpc(admin, 'phase13_finish_delivery', { p_delivery: deliveryId, p_http_status: status, p_error: error, ...args })
  return { status, error }
}
async function processRun(admin: Client, runId?: string) {
  const run = await rpc(admin, 'phase13_claim_run', { p_run: runId ?? null })
  if (!run || run.cancelled) return { processed: false }
  for (let position = 0; position < run.steps; position += 1) {
    let error: string | null = null
    try {
      const step = await rpc(admin, 'phase13_prepare_step', { p_run: run.id, p_token: run.token, p_position: position })
      if (step.done) continue
      const result = await sendDelivery(admin, step.delivery_id, { p_run: run.id, p_token: run.token })
      error = result.error
    } catch (caught) { error = caught instanceof SafeError && caught.code === 'unauthorized' ? 'authorization_revoked' : 'invalid_configuration' }
    await rpc(admin, 'phase13_finish_step', { p_run: run.id, p_token: run.token, p_position: position, p_error: error })
    if (error) return { processed: true, id: run.id, status: 'retry_or_failed' }
  }
  await rpc(admin, 'phase13_finish_run', { p_run: run.id, p_token: run.token })
  return { processed: true, id: run.id, status: 'succeeded' }
}
async function matchesWorker(request: Request) {
  const expected = Deno.env.get('AUTOMATION_WORKER_TOKEN')
  if (!expected || expected.length < 32) throw new SafeError('configuration_missing', 503)
  const presented = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  const bytes = new TextEncoder()
  // Constant-length digests are compared in constant work; never log either token.
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', bytes.encode(expected)), crypto.subtle.digest('SHA-256', bytes.encode(presented))])
  const left = new Uint8Array(a), right = new Uint8Array(b)
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index]
  return mismatch === 0
}
export default {
  async fetch(request: Request) {
    const origin = request.headers.get('Origin')
    if (origin && !allowedOrigins.has(origin)) return json({ error: 'origin_forbidden' }, 403, origin)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) })
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
    try {
      const parsed = requestSchema.safeParse(await limitedJson(request))
      if (!parsed.success) throw new SafeError('invalid_payload')
      const input = parsed.data
      const { user, admin } = clients(request.headers.get('Authorization'))
      if (input.operation === 'dispatch') {
        if (!await matchesWorker(request)) throw new SafeError('unauthorized', 401)
        return json(await processRun(admin), 200, origin)
      }
      const { data, error } = await user.auth.getUser()
      if (error || !data.user) throw new SafeError('unauthorized', 401)
      const actor = data.user.id
      if (input.operation === 'configureIntegration') {
        const {key,version} = await integrationKey(keyOptions())
        await endpoint(input.endpoint)
        const id = await rpc(user, 'phase13_save_connection', { p_project: input.projectId, p_name: input.name, p_key: input.key, p_id: input.connectionId ?? null, p_events: input.eventTypes })
        await rpc(admin, 'phase13_store_credentials', { p_connection: id, p_actor: actor, p_url: input.endpoint, p_cipher: await sealSecret(input.secret, id, key,version), p_key: input.key })
        return json({ id, configured: true }, 200, origin)
      }
      if (input.operation === 'testIntegration') {
        const delivery = await rpc(admin, 'phase13_test_connection', { p_connection: input.connectionId, p_actor: actor, p_key: input.key })
        if (delivery.replay) return json(delivery, 200, origin)
        const result = await sendDelivery(admin, delivery.id, { p_actor: actor })
        return json({ id: delivery.id, status: result.error ? 'failed' : 'delivered', error: result.error }, 200, origin)
      }
      if (input.operation === 'runAutomation') {
        const id = await rpc(user, 'phase13_manual_run', { p_automation: input.automationId, p_key: input.key })
        return json({ id, ...await processRun(admin, id) }, 200, origin)
      }
      if (input.operation === 'retryAutomation') {
        await rpc(user, 'phase13_retry_run', { p_run: input.runId })
        return json({ id: input.runId, ...await processRun(admin, input.runId) }, 200, origin)
      }
      const provider = configuredProvider(Deno.env.get('AI_PROVIDER'))
      const run = await rpc(admin, 'phase13_start_ai', { p_project: input.projectId, p_actor: actor, p_task: input.task, p_key: input.key })
      if (run.replay) return json({ id: run.id, replay: true, status: run.status }, 200, origin)
      try {
        const result = await generateValidated(provider, input.task, run.context, input.input)
        await rpc(admin, 'phase13_complete_ai', { p_run: run.id, p_actor: actor, p_result: result })
        // Fetch through the user read model; a mid-flight revocation cannot return an unapproved result.
        const history = await rpc(user, 'phase13_history', { p_project: input.projectId, p_kind: 'ai' })
        const completed = history.items.find((item: { id: string }) => item.id === run.id)
        if (completed?.status !== 'succeeded') throw new SafeError('unauthorized', 403)
        return json({ id: run.id, status: 'succeeded' }, 200, origin)
      } catch (caught) {
        const safe = caught instanceof SafeError ? caught : new SafeError('provider_unavailable', 503)
        await rpc(admin, 'phase13_complete_ai', { p_run: run.id, p_actor: actor, p_result: null, p_error: safe.code })
        throw safe
      }
    } catch (caught) {
      const safe = caught instanceof SafeError ? caught : new SafeError('provider_unavailable', 503)
      return json({ error: safe.code }, safe.status, origin)
    }
  },
}
