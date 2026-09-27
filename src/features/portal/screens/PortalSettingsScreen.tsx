import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/context/AuthContext'
import { PortalHeading } from '../ui/PortalPrimitives'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const signOut = async () => { await auth.signOut(); navigate('/login', { replace: true }) }
  return <div className="portal-page"><PortalHeading title="Configuración" description="Tu perfil y acceso al portal." />
    <section className="portal-section" aria-labelledby="portal-profile-title"><h2 id="portal-profile-title">Perfil</h2>
      <dl className="portal-settings-list"><div><dt>Nombre</dt><dd>{auth.actor?.profile?.display_name ?? 'Sin nombre'}</dd></div>
        <div><dt>Correo</dt><dd>{auth.actor?.user.email ?? 'Sin correo'}</dd></div>
        <div><dt>Zona horaria</dt><dd>{auth.actor?.profile?.timezone ?? 'America/Mexico_City'}</dd></div></dl>
      <button type="button" className="portal-action" onClick={signOut}>Cerrar sesión</button>
    </section></div>
}
