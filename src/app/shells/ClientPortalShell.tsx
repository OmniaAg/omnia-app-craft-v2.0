import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../features/auth/context/AuthContext'
import logo from '../../assets/images/brand/logos_omnia/OMNIA_Version_fullblanco.webp'
import { NotificationBadge } from '../../features/messaging/ui/NotificationBadge'
import '../../features/portal/ui/portal.css'

const links = [
  { to: '/portal', label: 'Resumen', end: true },
  { to: '/portal/projects', label: 'Proyectos', end: false },
  { to: '/portal/approvals', label: 'Aprobaciones', end: false },
  { to: '/portal/messages', label: 'Mensajes', end: false },
  { to: '/portal/notifications', label: 'Notificaciones', end: false },
  { to: '/portal/documents', label: 'Documentos', end: false },
  { to: '/portal/reports', label: 'Reportes', end: false },
  { to: '/portal/settings', label: 'Configuración', end: false },
]

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [navOpen,setNavOpen]=useState(false)
  const [pending,setPending]=useState(false)
  const [error,setError]=useState('')

  const signOut = async () => {
    setPending(true); setError('')
    try { await auth.signOut(); navigate('/login', { replace: true }) }
    catch { setError('No pudimos cerrar sesión. Comprueba la conexión y reintenta.'); setPending(false) }
  }

  return <div className="portal-shell">
    <NotificationBadge />
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
      <button className="mobile-menu-toggle portal-menu-toggle" type="button" aria-expanded={navOpen} aria-controls="portal-nav"
        onClick={() => setNavOpen(value => !value)}>{navOpen ? 'Cerrar menú' : 'Menú del portal'}</button>
      {error ? <p role="alert">{error}</p> : null}
      <nav id="portal-nav" data-open={navOpen} className="portal-nav" aria-label="Navegación del portal">
        {links.map(link => <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setNavOpen(false)}
          className={({ isActive }) => isActive ? 'portal-nav__link is-active' : 'portal-nav__link'}>
          {link.label}
        </NavLink>)}
      </nav>
    </header>
    <main id="portal-main" className="portal-main"><Outlet /></main>
    <footer className="portal-footer"><span>OMNIA · Tu espacio de trabajo compartido</span>
      <span>Los proyectos y archivos visibles dependen de tu acceso asignado.</span></footer>
  </div>
}
