import { useState, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { GroupedNavigation } from '../navigation/GroupedNavigation'
import type { NavigationGroup } from '../navigation/navigation'
import omniaLogo from '../../assets/images/brand/logos_omnia/OMNIA_Version_fullblanco.webp'

type FoundationShellProps = {
  title: string
  description: string
  accent: 'purple' | 'blue'
  navItems: NavigationGroup[]
  identityLabel: string
  onSignOut: () => Promise<void>
  showIntro?: boolean
  footerLabel?: string
  notificationBadge?: ReactNode
}

export function FoundationShell({
  title,
  description,
  accent,
  navItems,
  identityLabel,
  onSignOut,
  showIntro = true,
  footerLabel = 'Phase 2 · Identity, Auth & Authorization',
  notificationBadge,
}: FoundationShellProps) {
  const [signOutPending, setSignOutPending] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setSignOutPending(true)
    setSignOutError(null)
    try {
      await onSignOut()
    } catch {
      setSignOutError('No pudimos cerrar la sesión. Intenta de nuevo.')
      setSignOutPending(false)
    }
  }

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
        <GroupedNavigation groups={navItems} label="Navegación interna" notificationBadge={notificationBadge} />
          <button
            className="shell-sign-out"
            type="button"
            disabled={signOutPending}
            aria-busy={signOutPending}
            onClick={() => void handleSignOut()}
          >
            {signOutPending ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
          {signOutError ? (
            <span className="surface-nav__error" role="alert">
              {signOutError}
            </span>
          ) : null}
      </header>

      <main id="main-content" className={showIntro ? 'app-main' : 'app-main app-main--content'} tabIndex={-1}>
        {showIntro ? (
          <div className="surface-intro">
            <h1 data-route-heading tabIndex={-1}>{title}</h1>
            <p className="surface-description">{description}</p>
          </div>
        ) : null}
        <Outlet />
      </main>

      <footer className="app-footer">
        <span>{identityLabel}</span>
        <span>{footerLabel}</span>
      </footer>
    </div>
  )
}
