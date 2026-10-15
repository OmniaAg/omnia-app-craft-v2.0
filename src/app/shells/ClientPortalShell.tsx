import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { GroupedNavigation } from '../../shared/navigation/GroupedNavigation'
import { clientNavigation } from '../../shared/navigation/navigation'
import { useFlushDrafts } from '../../features/drafts/draft-context'
import { useAuth } from '../../features/auth/context/AuthContext'
import logo from '../../assets/images/brand/logos_omnia/OMNIA_Version_fullblanco.webp'
import { NotificationBadge } from '../../features/messaging/ui/NotificationBadge'
import '../../features/portal/ui/portal.css'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const flushDrafts = useFlushDrafts()
  const [pending,setPending]=useState(false)
  const [error,setError]=useState('')

  const signOut = async () => {
    setPending(true); setError('')
    try { if(!await flushDrafts())throw new Error('draft_save_failed');await auth.signOut(); navigate('/login', { replace: true }) }
    catch { setError('No pudimos cerrar sesión. Comprueba la conexión y reintenta.'); setPending(false) }
  }

  return <div className="portal-shell">
    <a className="skip-link" href="#portal-main">Saltar al contenido</a>
    <header className="portal-header">
      <div className="portal-header__inner">
        <NavLink to="/portal" className="portal-brand" aria-label="OMNIA, ir al resumen del portal">
          <img src={logo} alt="OMNIA" width="130" height="46" />
          <span>Portal cliente</span>
        </NavLink>
        <div className="portal-header__identity">
          <span>{auth.actor?.profile?.display_name ?? auth.actor?.user.email ?? 'Cliente'}</span>
          <button type="button" disabled={pending} onClick={() => void signOut()}>{pending ? 'Cerrando…' : 'Cerrar sesión'}</button>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <GroupedNavigation groups={clientNavigation} label="Navegación del portal" notificationBadge={<NotificationBadge />} />
    </header>
    <main id="portal-main" className="portal-main"><Outlet /></main>
    <footer className="portal-footer"><span>OMNIA · Tu espacio de trabajo compartido</span>
      <span>Los proyectos y archivos visibles dependen de tu acceso asignado.</span></footer>
  </div>
}
