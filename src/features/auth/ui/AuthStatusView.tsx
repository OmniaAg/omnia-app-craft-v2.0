import omniaMark from '../../../assets/images/brand/logos_omnia/OMNIA_Version_isotipo.webp'

type AuthStatusViewProps = {
  title: string
  description?: string
}

export function AuthStatusView({
  title,
  description = 'Estamos resolviendo tu sesión y contexto autorizado.',
}: AuthStatusViewProps) {
  return (
    <main className="auth-status" aria-busy="true" aria-live="polite">
      <img src={omniaMark} width="64" height="64" alt="" />
      <h1 data-route-heading tabIndex={-1}>{title}</h1>
      <p>{description}</p>
      <span className="auth-status__pulse" aria-hidden="true" />
    </main>
  )
}
