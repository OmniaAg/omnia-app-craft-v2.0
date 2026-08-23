import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthStatusView } from '../ui/AuthStatusView'

type AuthGateProps = {
  context?: 'agency' | 'client'
}

export function AuthGate({ context }: AuthGateProps) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return <AuthStatusView title="Verificando tu sesión" />
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (auth.status === 'error') {
    return <Navigate to="/forbidden" replace />
  }

  if (
    (context === 'agency' && !auth.hasAgencyContext) ||
    (context === 'client' && !auth.hasClientContext)
  ) {
    return <Navigate to="/forbidden" replace />
  }

  return <Outlet />
}
