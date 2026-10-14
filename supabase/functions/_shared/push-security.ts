import { SafeError } from './phase13-security.ts'
export function pushEndpoint(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new SafeError('endpoint_forbidden') }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || raw.length>2048
    || !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname)) {
    throw new SafeError('endpoint_forbidden')
  }
  return url
}
export function pushOutcome(status: number | null): 'gone' | 'rate_limited' | 'unavailable' | 'timeout' | 'rejected' | null {
  if (status !== null && status>=200 && status<300) return null
  if (status===404 || status===410) return 'gone'
  if (status===429) return 'rate_limited'
  if (status !== null && status>=500) return 'unavailable'
  return status===null ? 'timeout' : 'rejected'
}
