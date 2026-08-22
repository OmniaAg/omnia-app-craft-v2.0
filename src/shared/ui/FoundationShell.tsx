import { Link, NavLink, Outlet } from 'react-router-dom'
import omniaLogo from '../../assets/images/brand/logos_omnia/OMNIA_Version_fullblanco.webp'

type FoundationShellProps = {
  title: string
  description: string
  accent: 'purple' | 'blue'
}

const navItems = [
  { href: '/app', label: 'Interno' },
  { href: '/portal', label: 'Portal' },
  { href: '/login', label: 'Acceso' },
]

export function FoundationShell({
  title,
  description,
  accent,
}: FoundationShellProps) {
  return (
    <div className="app-surface" data-accent={accent}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <header className="app-header">
        <Link className="brand-link" to="/" aria-label="OMNIA Craft, inicio">
          <img src={omniaLogo} width="145" height="37" alt="OMNIA" />
          <span>Craft</span>
        </Link>
        <nav className="surface-nav" aria-label="Navegación de foundation">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <div className="surface-intro">
          <h1>{title}</h1>
          <p className="surface-description">{description}</p>
        </div>
        <Outlet />
      </main>

      <footer className="app-footer">
        <span>OMNIA Craft 2.0</span>
        <span>Phase 0 · Architecture &amp; Developer Foundation</span>
      </footer>
    </div>
  )
}
