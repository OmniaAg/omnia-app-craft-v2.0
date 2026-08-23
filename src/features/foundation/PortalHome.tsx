import { useAuth } from '../auth/context/AuthContext'

export function Component() {
  const auth = useAuth()
  const organizationCount = auth.actor?.clientMemberships.length ?? 0

  return (
    <section className="foundation-panel" aria-labelledby="portal-foundation-title">
      <h2 id="portal-foundation-title">Aislamiento cliente activo</h2>
      <p>
        Tu sesión pertenece a {organizationCount} organización u organizaciones
        autorizadas. En Phase 2 sólo existe el contexto mínimo; no hay acceso
        implícito a Projects ni datos internos.
      </p>
    </section>
  )
}
