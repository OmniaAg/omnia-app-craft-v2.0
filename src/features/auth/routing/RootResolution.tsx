import { Navigate } from 'react-router-dom'
import { defaultRouteFor } from '../model/authorization'
import { useAuth } from '../context/AuthContext'
import { AuthStatusView } from '../ui/AuthStatusView'

export function RootResolution() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return <AuthStatusView title="Preparando OMNIA Craft" />
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  if (auth.status === 'error' || !auth.actor) {
    return <Navigate to="/forbidden" replace />
  }

  return <Navigate to={defaultRouteFor(auth.actor)} replace />
}
