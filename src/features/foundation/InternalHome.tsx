import { useAuth } from '../auth/context/AuthContext'

export function Component() {
  const auth = useAuth()
  const capabilityCount = auth.actor?.capabilities.length ?? 0

  return (
    <>
      <div className="surface-intro">
        <h1 data-route-heading tabIndex={-1}>Espacio interno de OMNIA</h1>
        <p className="surface-description">Opera el registro comercial desde CRM. Las acciones visibles siguen tu proyección de capabilities.</p>
      </div>
      <section className="foundation-panel" aria-labelledby="internal-foundation-title">
        <h2 id="internal-foundation-title">Identidad interna verificada</h2>
        <p>
          La proyección de UX reporta {capabilityCount} capabilities activas en tus
          scopes. Esta cifra orienta la interfaz; nunca reemplaza las policies RLS
          ni los comandos autorizados del backend.
        </p>
      </section>
    </>
  )
}
