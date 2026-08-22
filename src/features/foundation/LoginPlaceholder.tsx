import { SharedPlaceholder } from '../../shared/ui/SharedPlaceholder'

export function Component() {
  return (
    <SharedPlaceholder
      title="Acceso todavía no implementado"
      description="La autenticación comienza en Phase 2. Esta ruta sólo establece el boundary compartido de acceso."
      actionHref="/app"
      actionLabel="Volver a la foundation"
    />
  )
}
