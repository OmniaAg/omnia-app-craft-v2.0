import { useSyncExternalStore } from 'react'
const listeners = new Set<() => void>()
let online = typeof navigator === 'undefined' || navigator.onLine !== false
let failed = false
const emit = () => listeners.forEach(listener => listener())
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true; failed = false; emit() })
  window.addEventListener('offline', () => { online = false; emit() })
}
export function assertOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Estás sin conexión. Vuelve a intentar cuando recuperes la red.')
}
export function useConnectivity() {
  const state = useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback) },
    () => !online ? 'offline' : failed ? 'degraded' : 'online', () => 'online')
  return { online:state !== 'offline', degraded:state === 'degraded' }
}
export function guardedFetch(fetcher: typeof fetch): typeof fetch {
  return async (input,init) => {
    assertOnline()
    try {
      // No offline queue, persisted query cache, or synthetic success response.
      const response = await fetcher(input,init)
      if (failed) { failed = false; emit() }
      return response
    } catch (error) { failed = true; emit(); throw error }
  }
}
