import { useSyncExternalStore } from 'react'
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome:string }> }
type State = { installed:boolean; canInstall:boolean; ready:boolean; waiting:boolean }
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?:boolean }).standalone === true)
let state: State = { installed:standalone(),canInstall:false,ready:false,waiting:false }
let registration: ServiceWorkerRegistration | undefined
let installEvent: InstallEvent | undefined
let started = false
let updating = false
const listeners = new Set<() => void>()
const update = (next: Partial<State>) => { state = { ...state,...next }; listeners.forEach(listener => listener()) }
export function usePwaStatus() {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback) },() => state,() => state)
}
export function initializePwa() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event as InstallEvent; update({ canInstall:true })
  })
  window.addEventListener('appinstalled', () => { installEvent=undefined; update({ installed:true,canInstall:false }) })
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) window.location.reload()
  })
  void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(result => {
    registration=result
    update({ready:Boolean(result.active),waiting:Boolean(result.waiting)})
    result.addEventListener('updatefound', () => {
      const worker=result.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state==='installed') update({ waiting:Boolean(result.waiting && navigator.serviceWorker.controller),ready:Boolean(result.active) })
        if (worker.state==='activated') update({ ready:true })
      })
    })
    // One update check per visit; no polling.
    void result.update().catch(() => undefined)
  }).catch(() => update({ready:false}))
}
export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  const event=installEvent; installEvent=undefined; update({canInstall:false})
  await event.prompt(); await event.userChoice
  return true
}
export function applyUpdate() {
  if (registration?.waiting && window.confirm('La aplicación se recargará. Guarda tus cambios antes de actualizar.')) {
    updating=true; registration.waiting.postMessage({type:'ACTIVATE_UPDATE'})
  }
}
