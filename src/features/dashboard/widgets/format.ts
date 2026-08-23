export function formatDue(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', timeZone: 'America/Mexico_City',
  }).format(new Date(value))
}
