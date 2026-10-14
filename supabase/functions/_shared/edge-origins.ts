export function edgeAllowedOrigins(raw: string | undefined, runtimeUrl: string | undefined): Set<string> {
  let local = false
  try { local = ['kong','localhost','127.0.0.1'].includes(new URL(runtimeUrl ?? '').hostname) } catch { /* Fail closed. */ }
  const origins = new Set(local ? ['http://localhost:53170','http://127.0.0.1:53170'] : [])
  for (const value of (raw ?? '').split(',').map(item=>item.trim()).filter(Boolean)) {
    try {
      const url = new URL(value)
      if (url.origin !== value || url.username || url.password) continue
      if (url.protocol === 'https:' || local && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)) origins.add(value)
    } catch { /* Wildcards and malformed configuration grant no origin. */ }
  }
  return origins
}
