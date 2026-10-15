import { DeviceSettings } from './DeviceSettings'
import { useAuth } from '../auth/context/AuthContext'
import { ProfileSettings } from '../auth/ui/ProfileSettings'
const roleLabels:Record<string,string>={agency_director:'Agency Director',developer:'Developer',project_manager:'Project Manager',contributor:'Contributor'}
export function Component() {
  const auth=useAuth()
  return <div className="device-page"><h1 data-route-heading tabIndex={-1}>Configuración</h1>
    <section><h2>Tu acceso</h2>{auth.actor?.agencyMemberships.map(membership=><p key={membership.id}>{roleLabels[membership.role_key]??membership.role_key} · {membership.status==='active'?'Activo':'Inactivo'}</p>)}</section>
    <ProfileSettings/><DeviceSettings surface="app" /></div>
}
