import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthContext'
import { DraftProvider } from '../../features/drafts/DraftProvider'

export function RouteFocusManager() {
  const location = useLocation()
  const auth = useAuth()

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-route-heading]')
        ?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname])

  return <DraftProvider key={auth.actor?.user.id ?? 'anonymous'}><Outlet /></DraftProvider>
}
