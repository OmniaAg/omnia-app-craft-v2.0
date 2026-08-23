import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthContext'
import { FoundationShell } from '../../shared/ui/FoundationShell'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await auth.signOut()
    navigate('/login', { replace: true })
  }

  const navItems = [
    { href: '/portal', label: 'Portal cliente' },
    ...(auth.hasAgencyContext ? [{ href: '/app', label: 'Interno' }] : []),
  ]

  return (
    <FoundationShell
      title="Un espacio separado para clientes"
      description="Este shell sólo aparece con una client membership activa. Organization membership no concede acceso futuro a Projects."
      accent="blue"
      navItems={navItems}
      identityLabel={auth.actor?.user.email ?? 'Sesión cliente'}
      onSignOut={handleSignOut}
    />
  )
}
