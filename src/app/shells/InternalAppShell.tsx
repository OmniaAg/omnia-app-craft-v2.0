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
    { href: '/app', label: 'Interno' },
    { href: '/app/my-space', label: 'Mi Espacio' },
    { href: '/app/projects', label: 'Proyectos' },
    { href: '/app/editorial/calendar', label: 'Editorial' },
    { href: '/app/crm/accounts', label: 'Organizations' },
    { href: '/app/crm/contacts', label: 'Contacts' },
    { href: '/app/crm/opportunities', label: 'Opportunities' },
    ...(auth.hasClientContext
      ? [{ href: '/portal', label: 'Portal cliente' }]
      : []),
  ]

  return (
    <FoundationShell
      title="Espacio interno de OMNIA"
      description="Tu membership interna está activa. Las acciones visibles se proyectan desde capabilities, pero RLS y RPC deciden cada acceso."
      accent="purple"
      navItems={navItems}
      identityLabel={auth.actor?.user.email ?? 'Sesión interna'}
      onSignOut={handleSignOut}
      showIntro={false}
      footerLabel="OMNIA · Operaciones internas"
    />
  )
}
