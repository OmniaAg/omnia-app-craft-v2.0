import { z } from 'zod'

export class SafeError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status }
}
const encoder = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unbase64 = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0))

export const summarySchema = z.object({ summary: z.string().min(1).max(2000), open_work: z.number().int().min(0).max(99_999_999), completed_work: z.number().int().min(0).max(99_999_999) }).strict()
export const draftSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().max(2000), priority: z.enum(['low', 'normal', 'high', 'urgent']) }).strict()
// 512 accepted characters can expand beyond 2 KiB after UTF-8 + GCM tag + base64.
export const cipherSchema = z.object({ algorithm: z.literal('AES-GCM'), key_version: z.string().regex(/^[1-9][0-9]{0,3}$/), iv: z.string().max(40), ciphertext: z.string().max(4096) }).strict()

export async function encryptionKey(value: string | undefined): Promise<CryptoKey> {
  try {
    if (!value) throw new Error()
    const bytes = unbase64(value)
    if (bytes.length !== 32) throw new Error()
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
  } catch { throw new SafeError('configuration_missing', 503) }
}
export async function sealSecret(secret: string, connectionId: string, key: CryptoKey, version = '1') {
  if (!/^[1-9][0-9]{0,3}$/.test(version)) throw new SafeError('configuration_missing', 503)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`omnia:${connectionId}:${version}`) }, key, encoder.encode(secret))
  return { algorithm: 'AES-GCM', key_version: version, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }
}
export async function openSecret(envelope: unknown, connectionId: string, key: CryptoKey) {
  try {
    const cipher = cipherSchema.parse(envelope)
    if (unbase64(cipher.iv).length !== 12 || unbase64(cipher.ciphertext).length < 16) throw new Error()
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(cipher.iv), additionalData: encoder.encode(`omnia:${connectionId}:${cipher.key_version}`) }, key, unbase64(cipher.ciphertext))
    return new TextDecoder().decode(plaintext)
  } catch { throw new SafeError('configuration_missing', 503) }
}
export async function integrationKey(options: { keyring?: string; legacy?: string; activeVersion?: string }, version?: string) {
  const selected = version ?? options.activeVersion ?? '1'
  if (!/^[1-9][0-9]{0,3}$/.test(selected)) throw new SafeError('configuration_missing',503)
  let material: string | undefined
  if (options.keyring) {
    try { material = z.record(z.string().regex(/^[1-9][0-9]{0,3}$/),z.string()).parse(JSON.parse(options.keyring))[selected] }
    catch { throw new SafeError('configuration_missing',503) }
  } else if (selected === '1') material = options.legacy
  return { key: await encryptionKey(material), version: selected }
}
export async function signature(secret: string, timestamp: string, deliveryId: string, body: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${deliveryId}.${body}`)))
  return `v1=${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`
}

export function isPublicAddress(address: string): boolean {
  const value = address.toLowerCase()
  // Conservative IPv6 support: only global unicast, excluding mapped/transition addresses.
  if (value.includes(':')) return /^[23][0-9a-f]{3}:/.test(value) && !value.startsWith('2001:') && !value.startsWith('2002:')
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c] = parts
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0 || (b === 2))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113) || (a === 100 && b >= 64 && b <= 127))
}
export async function validateEndpoint(raw: string, options: {
  origins: string[]; allowLocalHttp: boolean; trustedEndpoints?: string[]; resolve: (hostname: string) => Promise<string[]>
}): Promise<URL> {
  let url: URL
  try { url = new URL(raw) } catch { throw new SafeError('endpoint_forbidden') }
  if (raw.length > 2048 || url.username || url.password || url.search || url.hash || !options.origins.includes(url.origin)) throw new SafeError('endpoint_forbidden')
  const local = ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(url.hostname)
  if (local && options.allowLocalHttp && url.protocol === 'http:') return url
  // A user cannot choose a hostname/path, including one under an allowed origin.
  // These exact endpoints are operator-owned configuration with trusted DNS.
  // Fetch cannot pin DNS in this runtime; production still needs network egress controls.
  if (!options.trustedEndpoints?.includes(url.href)) throw new SafeError('endpoint_forbidden')
  if (url.protocol !== 'https:' || local || url.port && url.port !== '443') throw new SafeError('endpoint_forbidden')
  let addresses: string[]
  try { addresses = await options.resolve(url.hostname) } catch { throw new SafeError('endpoint_forbidden') }
  if (!addresses.length || addresses.some(address => !isPublicAddress(address))) throw new SafeError('endpoint_forbidden')
  return url
}
export function deliveryError(status: number): string | null {
  if (status >= 200 && status <= 299) return null
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_unavailable'
  if (status === 401 || status === 403) return 'invalid_credentials'
  return 'provider_rejected'
}
export async function limitedJson(request: Request, maxBytes = 16_384, timeoutMs = 5000): Promise<unknown> {
  if (!request.body || Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new SafeError('invalid_payload')
  const reader = request.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_,reject) => { timer=setTimeout(()=>reject(new SafeError('request_timeout',408)),timeoutMs) })
  try {
  while (true) {
    const { done, value } = await Promise.race([reader.read(),deadline])
    if (done) break
    size += value.length
    if (size > maxBytes) throw new SafeError('input_too_large', 413)
    chunks.push(value)
  }
  } catch (error) { void reader.cancel().catch(()=>undefined); throw error }
  finally { clearTimeout(timer); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new SafeError('invalid_payload') }
}
