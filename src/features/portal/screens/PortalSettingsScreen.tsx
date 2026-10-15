import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../auth/context/AuthContext'
import { PortalHeading } from '../ui/PortalPrimitives'
import { DeviceSettings } from '../../pwa/DeviceSettings'
import { ProfileSettings } from '../../auth/ui/ProfileSettings'
import { useFlushDrafts } from '../../drafts/draft-context'

export function Component() {
  const auth = useAuth()
  const flushDrafts=useFlushDrafts()
  const navigate = useNavigate()
  const [pending,setPending]=useState(false)
  const [error,setError]=useState('')
  const signOut = async () => {
    setPending(true); setError('')
    try { if(!await flushDrafts()){setPending(false);return};await auth.signOut(); navigate('/login', { replace: true }) }
    catch { setError('No pudimos cerrar sesión. Comprueba tu conexión y reintenta.'); setPending(false) }
  }
  return <div className="portal-page"><PortalHeading title="Configuración" description="Tu perfil y acceso al portal." />
    <section className="portal-section" aria-labelledby="portal-profile-title"><h2 id="portal-profile-title">Perfil</h2>
      <dl className="portal-settings-list"><div><dt>Nombre</dt><dd>{auth.actor?.profile?.display_name ?? 'Sin nombre'}</dd></div>
        <div><dt>Correo</dt><dd>{auth.actor?.user.email ?? 'Sin correo'}</dd></div>
        <div><dt>Zona horaria</dt><dd>{auth.actor?.profile?.timezone ?? 'America/Mexico_City'}</dd></div></dl>
      <button type="button" className="portal-action" disabled={pending} onClick={() => void signOut()}>{pending ? 'Cerrando…' : 'Cerrar sesión'}</button>
      {error ? <p role="alert">{error}</p> : null}
    </section><ProfileSettings/><DeviceSettings surface="portal" /></div>
}
