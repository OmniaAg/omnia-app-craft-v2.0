import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

export function RouteErrorPage() {
  const error = useRouteError()
  const description = isRouteErrorResponse(error)
    ? `La ruta respondió con el estado ${error.status}.`
    : 'No fue posible completar la navegación solicitada.'

  return (
    <main className="shared-placeholder" role="alert">
      <h1 data-route-heading tabIndex={-1}>No pudimos abrir esta sección</h1>
      <p>{description}</p>
      <Link className="primary-link" to="/">
        Volver al inicio
      </Link>
    </main>
  )
}
