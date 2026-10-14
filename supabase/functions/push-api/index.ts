import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { z } from 'zod'
import { edgeAllowedOrigins } from '../_shared/edge-origins.ts'
import { limitedJson, SafeError } from '../_shared/phase13-security.ts'
import { pushEndpoint, pushOutcome } from '../_shared/push-security.ts'

const input = z.object({ operation:z.enum(['configuration','dispatch']) }).strict()
const origins = edgeAllowedOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'),Deno.env.get('SUPABASE_URL'))
const headers = (origin: string | null) => ({ 'Access-Control-Allow-Origin':origin && origins.has(origin) ? origin : 'null',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-push-worker-token',
  'Access-Control-Allow-Methods':'POST,OPTIONS', 'Cache-Control':'no-store', Vary:'Origin' })
function key(modern: string, legacy: string): string {
  const value = Deno.env.get(modern)
  if (value) { try { return JSON.parse(value).default } catch { throw new SafeError('configuration_missing',503) } }
  const fallback = Deno.env.get(legacy)
  if (!fallback) throw new SafeError('configuration_missing',503)
  return fallback
}
function vapid() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT') ?? ''
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)
    || !/^mailto:[^\s@]+@[^\s@]+$/.test(subject)) throw new SafeError('configuration_missing',503)
  return { publicKey,privateKey,subject }
}
function sameToken(actual: string, expected: string) {
  if (expected.length<32 || actual.length!==expected.length) return false
  let diff=0; for (let i=0;i<expected.length;i++) diff|=actual.charCodeAt(i)^expected.charCodeAt(i)
  return diff===0
}

Deno.serve(async request => {
  const origin = request.headers.get('origin')
  const json = (value: unknown,status=200) => Response.json(value,{status,headers:headers(origin)})
  if (origin && !origins.has(origin)) return json({error:'origin_forbidden'},403)
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers:headers(origin)})
  if (request.method!=='POST') return json({error:'method_not_allowed'},405)
  try {
    const body=input.parse(await limitedJson(request,1024))
    const url=Deno.env.get('SUPABASE_URL')
    if (!url) throw new SafeError('configuration_missing',503)
    if (body.operation==='configuration') {
      const user=createClient(url,key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{
        global:{headers:{Authorization:request.headers.get('authorization') ?? ''}},auth:{persistSession:false},
      })
      if ((await user.auth.getUser()).error) throw new SafeError('unauthorized',401)
      return json({ publicKey:vapid().publicKey })
    }
    if (!sameToken(request.headers.get('x-push-worker-token') ?? '',Deno.env.get('PUSH_WORKER_TOKEN') ?? '')) throw new SafeError('worker_only',403)
    const details=vapid()
    const admin=createClient(url,key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}})
    async function rpc(name: string,args: Record<string,unknown>={}) {
      const {data,error}=await admin.rpc(name,args)
      if (error) throw new SafeError(error.message==='stale_claim' ? 'stale_claim' : 'delivery_command_failed',409)
      return data
    }
    const deterministic=Deno.env.get('PUSH_SENDER')==='local_deterministic'
    if (deterministic && (!['kong','127.0.0.1','localhost'].includes(new URL(url).hostname)
      || Deno.env.get('PHASE14_LOCAL_TEST_ONLY')!=='true')) throw new SafeError('test_sender_forbidden',503)
    let processed=0
    for (let i=0;i<10;i++) {
      const claim=await rpc('push_claim_delivery')
      if (!claim) break
      let material
      try { material=await rpc('push_delivery_material',{p_delivery:claim.id,p_token:claim.token}) }
      catch (error) { if (error instanceof SafeError && error.code==='stale_claim') continue; throw error }
      let status: number | null=null
      let safeError: string | null=null
      try {
        const endpoint=pushEndpoint(material.subscription.endpoint)
        // Encryption and VAPID signing always use the pinned server library,
        // including fixtures. fetch never follows a provider redirect.
        const generated=webpush.generateRequestDetails(material.subscription,JSON.stringify(material.payload),{
          vapidDetails:details,TTL:300,urgency:'normal',topic:claim.id.replaceAll('-',''),
        })
        if (deterministic) {
          status=endpoint.pathname.endsWith('_gone') ? 410
            : endpoint.pathname.endsWith('_temporary') && claim.attempt===1 ? 429 : 201
        } else {
          const response=await fetch(generated.endpoint,{method:'POST',headers:generated.headers,body:generated.body,
            redirect:'manual',signal:AbortSignal.timeout(8000)})
          status=response.status; await response.body?.cancel()
        }
      } catch (error) { safeError=error instanceof SafeError ? 'rejected' : 'timeout' }
      await rpc('push_finish_delivery',{p_delivery:claim.id,p_token:claim.token,p_status:status,p_error:safeError ?? pushOutcome(status)})
      processed++
    }
    return json({processed})
  } catch (error) {
    // Provider errors can contain endpoint/auth/key material. Never serialize or log them.
    return error instanceof SafeError ? json({error:error.code},error.status) : json({error:'invalid_request'},400)
  }
})
