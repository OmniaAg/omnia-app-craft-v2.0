import type { OmniaSupabaseClient } from '../../shared/api/supabase/client'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { assertOnline } from './connectivity'
export const pushSupported = () => typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window
  && 'serviceWorker' in navigator && 'PushManager' in window
let operation: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>) {
  const next=operation.then(fn,fn); operation=next.catch(() => undefined); return next
}
async function registration() {
  if (!('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker.getRegistration('/')
}
async function binding(reg: ServiceWorkerRegistration, type:'BIND_DEVICE'|'READ_DEVICE_BINDING'|'CLEAR_DEVICE_BINDING',token?:string): Promise<string|undefined> {
  if (!reg.active) return undefined
  return new Promise((resolve,reject) => {
    const channel=new MessageChannel()
    const timeout=setTimeout(() => { channel.port1.close(); reject(new Error('No pudimos preparar Push en este dispositivo. Reintenta.')) },5000)
    channel.port1.onmessage=event => {
      clearTimeout(timeout); channel.port1.close()
      if (event.data?.ok) resolve(event.data.token)
      else reject(new Error('No pudimos preparar Push en este dispositivo. Reintenta.'))
    }
    reg.active!.postMessage({type,token},[channel.port2])
  })
}
export async function devicePushStatus() {
  if (!pushSupported()) return false
  const reg=await registration()
  const subscription=await reg?.pushManager.getSubscription()
  if (!subscription) return false
  const token=await binding(reg!,'READ_DEVICE_BINDING')
  const {data,error}=await getSupabaseClient().rpc('push_subscription_status',{p_endpoint:subscription.endpoint,p_device_token:token})
  if (error) throw new Error('No pudimos comprobar las notificaciones de este dispositivo.')
  // Do not silently bind a previous user's endpoint to the current user.
  if (!data) await disableDevicePush(getSupabaseClient())
  return data
}
export function enableDevicePush(surface:'app'|'portal') {
  // requestPermission stays directly in the explicit click call, before awaits.
  assertOnline()
  if (!pushSupported()) return Promise.reject(new Error('Este navegador no admite Push. Si usas iPhone o iPad, instala la aplicación desde Compartir → Añadir a pantalla de inicio y vuelve a abrirla.'))
  if (Notification.permission==='denied') return Promise.reject(new Error('El permiso está bloqueado. Habilita notificaciones desde la configuración del navegador.'))
  const permission=Notification.permission==='granted' ? Promise.resolve('granted') : Notification.requestPermission()
  return serial(async () => {
    if (await permission !== 'granted') throw new Error('No se activaron las notificaciones. Puedes intentarlo desde la configuración del navegador.')
    const reg=await registration()
    if (!reg?.active) throw new Error('La aplicación aún no está lista. Abre la versión instalada o recarga e intenta de nuevo.')
    const client=getSupabaseClient()
    const {data,error}=await client.functions.invoke('push-api',{body:{operation:'configuration'}})
    if (error || typeof data?.publicKey!=='string') throw new Error('Push no está configurado. Intenta más tarde.')
    let subscription=await reg.pushManager.getSubscription()
    if (subscription) {
      const token=await binding(reg,'READ_DEVICE_BINDING')
      const status=await client.rpc('push_subscription_status',{p_endpoint:subscription.endpoint,p_device_token:token})
      if (status.error) throw new Error('No pudimos verificar el dispositivo.')
      if (!status.data) { await subscription.unsubscribe(); subscription=null }
    }
    const key=Uint8Array.from(atob(data.publicKey.replaceAll('-','+').replaceAll('_','/')),c => c.charCodeAt(0))
    subscription ??= await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
    const token=crypto.randomUUID()
    await binding(reg,'BIND_DEVICE',token)
    const serialized=subscription.toJSON()
    const registered=await client.rpc('register_push_subscription',{p_subscription:{endpoint:subscription.endpoint,
      device_token:token,keys:{p256dh:serialized.keys?.p256dh ?? '',auth:serialized.keys?.auth ?? ''}},p_surface:surface})
    if (registered.error) { await binding(reg,'CLEAR_DEVICE_BINDING'); await subscription.unsubscribe(); throw new Error('No pudimos activar Push. Vuelve a intentar.') }
    return true
  })
}
export function disableDevicePush(client: OmniaSupabaseClient, server=true) {
  return serial(async () => {
    const reg=await registration()
    if (!reg) return
    // Revoke the opaque local generation before network cleanup. In-flight A
    // pushes cannot display for B, even if a provider reuses the same endpoint.
    await binding(reg,'CLEAR_DEVICE_BINDING')
    const subscription=await reg.pushManager.getSubscription()
    if (subscription) {
      let deactivated=false
      if (server) {
        try { const result=await client.rpc('unregister_push_subscription',{p_endpoint:subscription.endpoint}); deactivated=!result.error } catch { /* Browser unsubscribe still revokes the endpoint. */ }
      }
      const removed=await subscription.unsubscribe()
      if (!removed && !deactivated) throw new Error('No pudimos desvincular Push del dispositivo. Reintenta antes de cerrar sesión.')
    }
    const displayed=await reg.getNotifications()
    displayed.forEach(notification => notification.close())
  })
}
