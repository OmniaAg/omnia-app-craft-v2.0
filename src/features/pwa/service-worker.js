/* Build injects BUILD_VERSION + an exact URL/integrity allowlist. No runtime cache writes. */
const CACHE_PREFIX = 'omnia-craft-static-'
const CACHE_NAME = CACHE_PREFIX + BUILD_VERSION
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v => v.toString(16).padStart(2,'0')).join('')
let deviceQueue=Promise.resolve()
function withDeviceLock(task) {
  // Serialize push display and logout/opt-in across worker versions when the
  // origin-wide Web Locks API exists; otherwise serialize this active worker.
  if (self.navigator?.locks) return self.navigator.locks.request('omnia-craft-push-device',task)
  const operation=deviceQueue.then(task,task)
  deviceQueue=operation.catch(() => undefined)
  return operation
}
// A single opaque opt-in generation, NOT an auth token/user ID/private query.
// Persisted outside Cache Storage so worker restarts cannot revive a revoked
// association. No endpoint, session, JWT, message or notification is stored.
async function deviceBinding(action, value) {
  const db = await new Promise((resolve,reject) => {
    const open=indexedDB.open('omnia-craft-device',1)
    open.onupgradeneeded=()=>open.result.createObjectStore('binding')
    open.onsuccess=()=>resolve(open.result); open.onerror=()=>reject(open.error)
  })
  try {
    return await new Promise((resolve,reject) => {
      const transaction=db.transaction('binding',action==='read' ? 'readonly' : 'readwrite')
      const store=transaction.objectStore('binding')
      const operation=action==='read' ? store.get('active') : action==='clear' ? store.delete('active') : store.put(value,'active')
      let result
      operation.onsuccess=()=>{ result=operation.result }
      transaction.oncomplete=()=>resolve(result)
      transaction.onerror=()=>reject(transaction.error); transaction.onabort=()=>reject(transaction.error)
    })
  } finally { db.close() }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    try {
      await Promise.all(Object.entries(STATIC_ASSETS).map(async ([path, integrity]) => {
        const response = await fetch(new Request(path, { cache: 'reload', credentials: 'omit', redirect: 'error' }))
        if (!response.ok || response.type === 'opaque' || await digest(await response.clone().arrayBuffer()) !== integrity) throw new Error('static_integrity_failed')
        await cache.put(path,response)
      }))
    } catch (error) { await caches.delete(CACHE_NAME); throw error }
  })())
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key)
    await self.clients.claim()
  })())
})
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting())
  if (['BIND_DEVICE','READ_DEVICE_BINDING','CLEAR_DEVICE_BINDING'].includes(event.data?.type)) {
    event.waitUntil(withDeviceLock(async () => {
      try {
        const client=event.source?.id ? await self.clients.get(event.source.id) : null
        if (!client || new URL(client.url).origin!==self.location.origin) throw new Error('invalid_client')
        const type=event.data.type
        if (type==='BIND_DEVICE' && !uuid.test(event.data.token)) throw new Error('invalid_binding')
        const token=await deviceBinding(type==='BIND_DEVICE' ? 'write' : type==='CLEAR_DEVICE_BINDING' ? 'clear' : 'read',event.data.token)
        if (type==='CLEAR_DEVICE_BINDING') for (const notification of await self.registration.getNotifications()) notification.close()
        event.ports[0]?.postMessage({ok:true,token})
      } catch { event.ports[0]?.postMessage({ok:false}) }
    }))
  }
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  // Supabase REST/Auth/Storage/Realtime/Functions, private downloads, external
  // origins, non-GET, query strings and credentials headers NEVER enter caches.
  if (url.origin !== self.location.origin || request.method !== 'GET' || request.headers.has('authorization')
      || /^\/(rest|auth|storage|realtime|functions)\//.test(url.pathname)) return
  if (request.mode === 'navigate' && /^\/(?:$|app(?:\/|$)|portal(?:\/|$)|login$|forgot-password$|reset-password$|accept-invite$|forbidden$)/.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) return response // Never persist navigation responses.
        const shell = await (await caches.open(CACHE_NAME)).match('/index.html')
        return shell ?? response
      } catch {
        return await (await caches.open(CACHE_NAME)).match('/index.html') ?? Response.error()
      }
    })())
  } else if (!url.search && Object.hasOwn(STATIC_ASSETS,url.pathname)) {
    event.respondWith((async () => await (await caches.open(CACHE_NAME)).match(url.pathname) ?? fetch(request))())
  }
})
self.addEventListener('push', event => {
  event.waitUntil(withDeviceLock(async () => {
    let payload
    try { payload = event.data?.json() } catch { return }
    if (!payload || !uuid.test(payload.notification_id) || !['app','portal'].includes(payload.surface)
        || !uuid.test(payload.device_token) || !/^[a-f0-9]{64}$/.test(payload.endpoint_hash)) return
    if (await deviceBinding('read')!==payload.device_token) return
    // A queued push for an unsubscribed/replaced endpoint is discarded even
    // after a shared-device account switch. No JWT/session storage in the SW.
    const subscription = await self.registration.pushManager.getSubscription()
    if (!subscription || await digest(new TextEncoder().encode(subscription.endpoint)) !== payload.endpoint_hash) return
    if (await deviceBinding('read')!==payload.device_token) return
    await self.registration.showNotification('OMNIA Craft', {
      body: 'Tienes una nueva notificación. Abre OMNIA para consultarla.',
      icon: '/icons/icon-192.png', badge: '/icons/badge-96.png',
      tag: `omnia:${payload.notification_id}`, renotify: false,
      data: { notification_id: payload.notification_id, surface: payload.surface },
    })
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data
  if (!data || !uuid.test(data.notification_id) || !['app','portal'].includes(data.surface)) return
  const destination = new URL(`/${data.surface}/push/${data.notification_id}`,self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) { await existing.navigate(destination); await existing.focus() }
    else await self.clients.openWindow(destination)
  })())
})
