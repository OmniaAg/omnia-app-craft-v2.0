export function formatPortalDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric',
    timeZone: value.length === 10 ? undefined : 'America/Mexico_City' }).format(date)
}

export function statusLabel(value: string) {
  const labels: Record<string, string> = {
    planning: 'En planeación', active: 'Activo', on_hold: 'En pausa', completed: 'Completado',
    planned: 'Planeado', in_progress: 'En curso', closed: 'Cerrado', pending: 'Pendiente',
    approved: 'Aprobado', changes_requested: 'Cambios solicitados',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}
