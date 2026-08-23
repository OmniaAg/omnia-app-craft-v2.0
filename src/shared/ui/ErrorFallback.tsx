export function ErrorFallback() {
  return (
    <main className="shared-placeholder" role="alert">
      <h1 data-route-heading tabIndex={-1}>OMNIA Craft encontró un problema</h1>
      <p>
        Recarga la página. Si el problema continúa, comparte este momento con el
        equipo técnico.
      </p>
      <button
        className="primary-link"
        type="button"
        onClick={() => window.location.reload()}
      >
        Recargar aplicación
      </button>
    </main>
  )
}
