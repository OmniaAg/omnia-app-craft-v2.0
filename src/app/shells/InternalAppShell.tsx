import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthContext'
import { FoundationShell } from '../../shared/ui/FoundationShell'
import { NotificationBadge } from '../../features/messaging/ui/NotificationBadge'
import { internalNavigation } from '../../shared/navigation/navigation'
import { useFlushDrafts } from '../../features/drafts/draft-context'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const flushDrafts = useFlushDrafts()

  const handleSignOut = async () => {
    if (!await flushDrafts()) throw new Error('draft_save_failed')
    await auth.signOut()
    navigate('/login', { replace: true })
  }

  const navItems = internalNavigation(auth.hasCapability, auth.hasClientContext)

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
      notificationBadge={<NotificationBadge />}
    />
  )
}
