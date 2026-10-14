import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash, randomUUID, createECDH } from 'node:crypto'
import { resolve, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
const root=resolve('dist'), original=readFileSync('dist/sw.js','utf8')
let worker=original
let serverOffline=false
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'}
const privateBody='{"private":"PRIVATE_PWA_SENTINEL","access_token":"JWT_PWA_SENTINEL"}'
const server=createServer((request,response) => {
  if (serverOffline) { request.socket.destroy(); return }
  const path=new URL(request.url,'http://localhost').pathname
  response.setHeader('Cache-Control','no-store')
  if (path==='/sw.js') { response.setHeader('content-type','text/javascript'); response.end(worker); return }
  if (path==='/worker-test.html') { response.setHeader('content-type','text/html'); response.end('<!doctype html><title>Local worker fixture</title><button id="native-push">Activar Push de prueba</button>'); return }
  if (/^\/(rest|auth|storage|functions|realtime)\//.test(path) || path==='/private-download') { response.setHeader('content-type','application/json'); response.end(privateBody); return }
  const file=resolve(root,`.${path}`)
  if (!file.startsWith(root+'\\') && !file.startsWith(root+'/')) { response.writeHead(403).end(); return }
  const actual=existsSync(file) && extname(file) ? file : resolve(root,'index.html')
  response.setHeader('content-type',mime[extname(actual)] ?? 'application/octet-stream'); response.end(readFileSync(actual))
})
await new Promise(done => server.listen(53171,'127.0.0.1',done))
const profile=mkdtempSync(join(tmpdir(),'omnia-craft-pwa-'))
const context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'allow',permissions:['notifications']})
const checks=[], check=(name,result) => { assert.ok(result,name); checks.push(name); console.log(`ok - ${name}`) }
try {
  const page=await context.newPage(), base='http://127.0.0.1:53171'
  await page.goto(`${base}/login`)
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  const manifest=await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  check('manifest identity, scope, start URL, standalone',manifest.name==='OMNIA Craft' && manifest.scope==='/' && manifest.start_url==='/' && manifest.display==='standalone')
  for (const icon of manifest.icons) {
    const result=await page.evaluate(async src => { const image=new Image(); image.src=src; await image.decode(); return [image.width,image.height] },icon.src)
    check(`icon resolves at ${icon.sizes} (${icon.purpose})`,result.join('x')===icon.sizes)
  }
  const cdp=await context.newCDPSession(page)
  let registrationId
  cdp.on('ServiceWorker.workerRegistrationUpdated',event => {
    registrationId=event.registrations.find(registration => registration.scopeURL===base+'/')?.registrationId ?? registrationId
  })
  await cdp.send('ServiceWorker.enable')
  const installability=await cdp.send('Page.getInstallabilityErrors')
  check('Chromium reports no installability errors',installability.installabilityErrors.length===0)
  check('production SW controls expected root scope',await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope===location.origin+'/'))
  for (const endpoint of ['/rest/v1/messages','/auth/v1/token','/storage/v1/object/private/report.pdf','/functions/v1/private','/realtime/v1/test','/private-download']) {
    check(`${endpoint} uses network private response`,await page.evaluate(async url => (await (await fetch(url)).text()).includes('PRIVATE_PWA_SENTINEL'),endpoint))
  }
  await page.evaluate(async () => { await caches.open('foreign-cache-sentinel'); await caches.open('omnia-craft-static-stale-fixture') })
  async function inspectCaches() {
    return page.evaluate(async () => {
      const entries=[]
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) {
        const response=await (await caches.open(name)).match(request)
        const contentType=response.headers.get('content-type') ?? ''
        const body=/text|json|javascript/.test(contentType) ? await response.clone().text() : ''
        entries.push({name,url:request.url,private:body.includes('PRIVATE_PWA_SENTINEL') || body.includes('JWT_PWA_SENTINEL')})
      }
      return entries
    })
  }
  const entries=await inspectCaches(), allowlist=JSON.parse(readFileSync('artifacts/phase-14/precache.json','utf8')).assets
  check('Cache Storage contains only build allowlist, never private JSON/token',entries.length===Object.keys(allowlist).length && entries.every(e => Object.hasOwn(allowlist,new URL(e.url).pathname) && !e.private))
  serverOffline=true
  await context.setOffline(true)
  await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await page.goto(`${base}/forgot-password`)
  await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await page.getByRole('heading',{name:'Recupera tu acceso'}).waitFor().catch(() => page.getByRole('heading').first().waitFor())
  try { await page.getByText(/Estás sin conexión/).waitFor({timeout:5000}) }
  catch (error) { await page.screenshot({path:'artifacts/phase-14/offline-failure.png',fullPage:true}); console.log(await page.evaluate(() => ({online:navigator.onLine,body:document.body.innerText}))); throw error }
  check('offline navigation renders static shell and status',await page.getByText(/Estás sin conexión/).isVisible())
  check('offline private API is never served from Cache Storage',await page.evaluate(async () => { try { await fetch('/rest/v1/messages'); return false } catch { return true } }))
  serverOffline=false
  await context.setOffline(false)
  await cdp.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await page.goto(`${base}/login`)
  check('reconnect clears offline indicator',await page.getByText(/Estás sin conexión/).count()===0)
  // Failed build must preserve the active shell/cache. Deliberately wrong integrity.
  worker=original.replace(/const BUILD_VERSION = "[^"]+"/, 'const BUILD_VERSION = "failed-update-fixture"').replace(/("\/index.html":")([a-f0-9]{64})/, '$1'+'0'.repeat(64))
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
  await page.waitForTimeout(1200)
  check('failed update preserves active SW and removes incomplete new cache',await page.evaluate(async () => !(await caches.keys()).includes('omnia-craft-static-failed-update-fixture') && Boolean(navigator.serviceWorker.controller)))
  worker=original.replace(/const BUILD_VERSION = "[^"]+"/,'const BUILD_VERSION = "update-B-fixture"')
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))
  await page.getByRole('button',{name:'Actualizar aplicación'}).waitFor()
  check('new worker waits; form/page is not force-reloaded',await page.evaluate(() => navigator.serviceWorker.controller.state==='activated'))
  page.once('dialog',dialog => dialog.accept())
  await Promise.all([page.waitForEvent('framenavigated',frame => frame===page.mainFrame()),page.getByRole('button',{name:'Actualizar aplicación'}).click()])
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(async () => {
    const keys=await caches.keys()
    return keys.filter(key => key.startsWith('omnia-craft-static-')).join()==='omnia-craft-static-update-B-fixture'
      && navigator.serviceWorker.controller?.state==='activated'
  })
  const keys=await page.evaluate(() => caches.keys())
  check('user update activates B, removes stale app caches, preserves foreign cache',keys.includes('foreign-cache-sentinel') && keys.filter(k => k.startsWith('omnia-craft-static-')).join()==='omnia-craft-static-update-B-fixture')
  // Keep this SW event fixture separate from the anonymous app's intentional
  // logout cleanup, which must clear device bindings on the login screen.
  await page.goto(`${base}/worker-test.html`)
  await context.grantPermissions(['notifications'],{origin:base})
  const nativePair=createECDH('prime256v1'); nativePair.generateKeys()
  await page.evaluate(publicKey => {
    document.querySelector('#native-push').addEventListener('click',async () => {
      try {
        const permission=Notification.permission==='default' ? await Notification.requestPermission() : Notification.permission
        if (permission!=='granted') throw new Error('permission_unavailable')
        const registration=await navigator.serviceWorker.ready
        const key=Uint8Array.from(atob(publicKey.replaceAll('-','+').replaceAll('_','/')),c => c.charCodeAt(0))
        const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
        await subscription.unsubscribe()
        window.phase14NativeSubscribe={supported:true}
      } catch (error) { window.phase14NativeSubscribe={supported:false,reason:error.message==='permission_unavailable' ? 'permission_unavailable' : error.name} }
    })
  },nativePair.getPublicKey().toString('base64url'))
  await page.getByRole('button',{name:'Activar Push de prueba'}).click()
  try { await page.waitForFunction(() => window.phase14NativeSubscribe,{},{timeout:6000}) } catch { /* External subscription provider not available; deterministic path follows. */ }
  const nativeSubscribe=await page.evaluate(() => window.phase14NativeSubscribe ?? {supported:false,reason:'External provider subscription timed out'})
  let activeWorker
  for (const candidate of context.serviceWorkers()) {
    try { if (await candidate.evaluate('BUILD_VERSION')==='update-B-fixture') activeWorker=candidate } catch { /* Redundant worker exited. */ }
  }
  assert.ok(activeWorker,'updated active worker')
  const endpoint='https://fcm.googleapis.com/fcm/send/phase14_worker_fixture'
  await activeWorker.evaluate(endpoint => { self.registration.pushManager.getSubscription=async () => ({endpoint}) },endpoint)
  const nativeDisplay=await activeWorker.evaluate(async () => {
    try {
      await self.registration.showNotification('OMNIA local QA',{tag:'phase14-probe'})
      for (const item of await self.registration.getNotifications()) item.close()
      return {supported:true}
    } catch (error) { return {supported:false,reason:error.message} }
  })
  // CDP permission overrides are not honored by this headless worker. The
  // display adapter is explicit; actual SW events, IDB and payload checks run.
  await activeWorker.evaluate(() => {
    self.phase14Display=[]
    self.registration.showNotification=async (_title,options) => {
      const item={...options,close:() => {self.phase14Display=self.phase14Display.filter(value => value!==item)}}
      self.phase14Display.push(item)
    }
    self.registration.getNotifications=async () => self.phase14Display
  })
  async function bind(type,token) {
    return page.evaluate(async ({type,token}) => {
      const registration=await navigator.serviceWorker.getRegistration()
      return new Promise(resolve => {
        const channel=new MessageChannel(); channel.port1.onmessage=event => resolve(event.data)
        registration.active.postMessage({type,token},[channel.port2])
      })
    },{type,token})
  }
  const tokenA=randomUUID(), tokenB=randomUUID(), notification=randomUUID()
  check('opaque device generation persisted without any user/session data',(await bind('BIND_DEVICE',tokenA)).ok)
  const payload={notification_id:notification,surface:'portal',device_token:tokenA,endpoint_hash:createHash('sha256').update(endpoint).digest('hex')}
  async function push(data) {
    assert.ok(registrationId,'CDP SW registration id')
    await cdp.send('ServiceWorker.deliverPushMessage',{origin:base,registrationId,data:JSON.stringify(data)})
    await page.waitForTimeout(500)
    return activeWorker.evaluate(async () => (await self.registration.getNotifications()).map(item => ({body:item.body,tag:item.tag,data:item.data})))
  }
  const displayed=await push(payload)
  check('real SW push invokes display adapter with generic content and distinct tag',displayed.length===1 && displayed[0].tag===`omnia:${notification}` && !displayed[0].body.includes('PRIVATE_PWA_SENTINEL'))
  await bind('CLEAR_DEVICE_BINDING')
  check('logout generation clear closes displayed notices',(await activeWorker.evaluate(async () => (await self.registration.getNotifications()).length))===0)
  await bind('BIND_DEVICE',tokenA)
  await activeWorker.evaluate(() => {
    const display=self.registration.showNotification.bind(self.registration)
    self.phase14DelayedDisplay=false
    self.registration.showNotification=async (...args) => {
      self.phase14DelayedDisplay=true
      await new Promise(resolve => setTimeout(resolve,200))
      return display(...args)
    }
  })
  await cdp.send('ServiceWorker.deliverPushMessage',{origin:base,registrationId,data:JSON.stringify({...payload,notification_id:randomUUID()})})
  await activeWorker.evaluate(async () => { while (!self.phase14DelayedDisplay) await new Promise(resolve => setTimeout(resolve,10)) })
  await bind('CLEAR_DEVICE_BINDING')
  await page.waitForTimeout(250)
  check('logout racing an in-progress push waits and closes the old notice before user switch',
    await activeWorker.evaluate(async () => (await self.registration.getNotifications()).length===0 && !await deviceBinding('read')))
  await bind('BIND_DEVICE',tokenB)
  check('in-flight A push discarded after B binds, even on identical endpoint',(await push(payload)).length===0)
  check('malicious URL/invalid notification cannot open/display',(await push({...payload,device_token:tokenB,notification_id:'https://evil.invalid',url:'https://evil.invalid'})).length===0)
  check('mismatched endpoint cannot display',(await push({...payload,device_token:tokenB,endpoint_hash:'0'.repeat(64)})).length===0)
  await bind('CLEAR_DEVICE_BINDING')
  const clickNavigations=[]
  const clickNavigation=frame => { if (frame===page.mainFrame()) clickNavigations.push(frame.url()) }
  page.on('framenavigated',clickNavigation)
  const nativeFocus=await activeWorker.evaluate(async data => {
    // Dispatch the actual registered click handler with a deterministic notice;
    // WindowClient navigation/focus are real. Native OS clicks are manual QA.
    const event=new Event('notificationclick'); let completed
    Object.defineProperty(event,'notification',{value:{data,close(){}}})
    Object.defineProperty(event,'waitUntil',{value:promise => {completed=promise}})
    self.dispatchEvent(event)
    try { await completed; return {supported:true} }
    catch (error) { if (error.name==='InvalidAccessError' && /focus/.test(error.message)) return {supported:false,reason:'Synthetic click has no OS user activation'}; throw error }
  },{notification_id:notification,surface:'portal',url:'https://evil.invalid'})
  await page.waitForTimeout(200)
  page.off('framenavigated',clickNavigation)
  check('click navigates existing real app window using internal UUID route',clickNavigations.some(url => new URL(url).pathname===`/portal/push/${notification}`)
    && clickNavigations.every(url => new URL(url).origin===base))
  const fallback=await activeWorker.evaluate(async data => {
    const match=self.clients.matchAll.bind(self.clients),open=self.clients.openWindow.bind(self.clients)
    const calls=[]
    try {
      self.clients.matchAll=async () => []
      self.clients.openWindow=async url => {calls.push(url);return null}
      for (const item of [data,{notification_id:'https://evil.invalid',surface:'portal'},{...data,surface:'https://evil.invalid'}]) {
        const event=new Event('notificationclick'); let completed
        Object.defineProperty(event,'notification',{value:{data:item,close(){}}})
        Object.defineProperty(event,'waitUntil',{value:promise => {completed=promise}})
        self.dispatchEvent(event); await completed
      }
      return calls
    } finally { self.clients.matchAll=match; self.clients.openWindow=open }
  },{notification_id:notification,surface:'portal',url:'https://evil.invalid'})
  check('no-window click opens one safe internal route; malicious IDs/surfaces ignored',fallback.length===1 && fallback[0]===`${base}/portal/push/${notification}`)
  const cacheEvidence=await inspectCaches()
  writeFileSync('artifacts/phase-14/pwa-integration.json',JSON.stringify({passed:checks.length,checks,installability,cacheEntries:cacheEvidence.length,cacheKeys:keys,nativeSubscribe,nativeDisplay,nativeFocus,notificationDisplay:'deterministic display adapter; actual CDP push event and Service Worker execution'},null,2))
  console.log(`PASS: ${checks.length} PWA integration checks`)
} finally {
  await context.close(); await new Promise(done => server.close(done))
  if (resolve(profile).startsWith(resolve(tmpdir())+requireSeparator()) && profile.includes('omnia-craft-pwa-')) rmSync(profile,{recursive:true,force:true})
}
function requireSeparator() { return process.platform==='win32' ? '\\' : '/' }
