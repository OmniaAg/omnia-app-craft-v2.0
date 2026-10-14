import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context/AuthContext'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { useConnectivity } from './connectivity'
import { promptInstall, usePwaStatus } from './runtime'
import { devicePushStatus, disableDevicePush, enableDevicePush, pushSupported } from './push-client'
import './pwa.css'
export function DeviceSettings({surface}:{surface:'app'|'portal'}) {
  const auth=useAuth(), pwa=usePwaStatus(), network=useConnectivity()
  const [enabled,setEnabled]=useState(false), [pending,setPending]=useState(false)
  const [error,setError]=useState(''), [instructions,setInstructions]=useState(false)
  const [permission,setPermission]=useState<NotificationPermission|'unsupported'>(() => pushSupported() ? Notification.permission : 'unsupported')
  useEffect(() => {
    let active=true
    void devicePushStatus().then(value => { if (active) setEnabled(value) }).catch(() => { if (active) setError('No pudimos comprobar Push. Comprueba la conexión y vuelve a abrir Configuración.') })
    return () => { active=false }
  },[auth.actor?.user.id])
  useEffect(() => {
    const refresh=() => setPermission(pushSupported() ? Notification.permission : 'unsupported')
    window.addEventListener('focus',refresh)
    return () => window.removeEventListener('focus',refresh)
  },[])
  async function install() {
    setError('')
    try { if (!await promptInstall()) setInstructions(true) } catch { setError('No pudimos abrir la instalación. Usa el menú de tu navegador.') }
  }
  async function toggle() {
    setPending(true); setError('')
    try {
      if (enabled) { await disableDevicePush(getSupabaseClient()); setEnabled(false) }
      else { await enableDevicePush(surface); setEnabled(true) }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos cambiar Push. Reintenta.') }
    finally { setPending(false); setPermission(pushSupported() ? Notification.permission : 'unsupported') }
  }
  return <section className="device-settings" aria-labelledby="device-settings-title">
    <h2 id="device-settings-title">Aplicación y notificaciones</h2>
    <div className="device-settings__row"><div><h3>Instalar OMNIA Craft</h3>
      <p>{pwa.installed ? 'La aplicación está instalada.' : 'Accede a tu espacio desde la pantalla de inicio.'}</p></div>
      {!pwa.installed ? <button type="button" onClick={() => void install()}>Instalar aplicación</button> : null}</div>
    {instructions ? <p role="status">En iPhone o iPad, abre Safari y elige Compartir → Añadir a pantalla de inicio. En otros navegadores, busca Instalar aplicación en su menú. La opción depende de tu navegador.</p> : null}
    <div className="device-settings__row"><div><h3>Notificaciones Push</h3>
      <p>{permission==='unsupported' ? 'Push no está disponible en este navegador. En iPhone o iPad, prueba desde la aplicación añadida a pantalla de inicio.'
        : permission==='denied' ? 'Permiso bloqueado. Puedes habilitarlo desde la configuración del navegador.'
        : enabled ? 'Activadas en este dispositivo. El contenido se consulta dentro de la aplicación.'
        : 'Opcionales. Recibe un aviso cuando tengas novedades; el contenido permanece dentro de OMNIA.'}</p>
      <p className="device-settings__meta">Permiso: {({default:'Sin solicitar',granted:'Concedido',denied:'Bloqueado',unsupported:'No compatible'})[permission]}</p></div>
      <button type="button" disabled={pending || !network.online || permission==='unsupported' || (permission==='denied' && !enabled)}
        aria-busy={pending} onClick={() => void toggle()}>{pending ? 'Guardando…' : enabled ? 'Desactivar Push' : 'Activar Push'}</button></div>
    {error ? <p role="alert">{error}</p> : null}
    <p role="status">{enabled ? 'Push activado en este dispositivo.' : 'Push desactivado en este dispositivo.'}</p>
  </section>
}
