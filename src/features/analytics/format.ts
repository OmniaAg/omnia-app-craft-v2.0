export const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 2 }).format(amount) }
  catch { return `${amount.toLocaleString('es-MX')} ${currency}` }
}
export const duration = (value: number | null, unit: string) => value === null ? 'Sin datos' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${unit}`
export const stamp = (value: string | null) => value ? new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin actividad'
