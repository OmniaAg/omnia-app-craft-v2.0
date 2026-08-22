import { SharedPlaceholder } from '../../shared/ui/SharedPlaceholder'

export function Component() {
  return (
    <SharedPlaceholder
      title="Esta ruta no existe"
      description="Revisa la dirección o vuelve a la foundation principal de OMNIA Craft."
      actionHref="/"
      actionLabel="Ir al inicio"
    />
  )
}
