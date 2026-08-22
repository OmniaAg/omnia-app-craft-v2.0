import { SharedPlaceholder } from '../../shared/ui/SharedPlaceholder'

export function Component() {
  return (
    <SharedPlaceholder
      title="Acceso no disponible"
      description="Esta pantalla comunicará denegaciones reales en fases posteriores. La seguridad siempre será responsabilidad de RLS y comandos de backend."
      actionHref="/"
      actionLabel="Ir al inicio"
    />
  )
}
