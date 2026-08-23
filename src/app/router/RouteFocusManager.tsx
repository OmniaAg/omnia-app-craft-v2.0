import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

export function RouteFocusManager() {
  const location = useLocation()

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-route-heading]')
        ?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname])

  return <Outlet />
}
