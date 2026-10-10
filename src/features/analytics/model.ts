import { z } from 'zod'

export const sections = ['overview', 'projects', 'work', 'editorial', 'reviews', 'billing', 'reports'] as const
export type Section = typeof sections[number]
const date = z.iso.date()
// Existing deterministic DB fixtures use UUIDs without RFC version bits.
const uuid = z.guid()
export const filterSchema = z.object({
  from: date, to: date,
  agency: uuid.optional(), organization: uuid.optional(), brand: uuid.optional(), project: uuid.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).refine(v => v.from <= v.to && (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
  { message: 'Elige fechas en orden y un máximo de 366 días.' })
export type Filters = z.infer<typeof filterSchema>
export function mexicoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function period(days: number, today = mexicoToday()) {
  const start = new Date(`${today}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return { from: start.toISOString().slice(0, 10), to: today }
}
export function readFilters(params: URLSearchParams) {
  const fallback = period(30)
  return filterSchema.safeParse({ ...fallback, ...Object.fromEntries(
    ['from', 'to', 'agency', 'organization', 'brand', 'project', 'currency'].flatMap(key => params.get(key) ? [[key, params.get(key)]] : []),
  ) })
}
const counts = z.record(z.string(), z.number().nonnegative())
const time = z.string()
export const overviewSchema = z.object({ active_projects: z.number(), active_clients: z.number(), open_work: z.number(),
  overdue_work: z.number(), blocked_work: z.number(), pending_internal: z.number(), pending_client: z.number(),
  completed_period: z.number(), completed_previous: z.number(), as_of: time, from: time, to: time })
export const projectRowSchema = z.object({ project_id: uuid, project_name: z.string(), project_status: z.string(),
  organization_name: z.string(), brand_name: z.string(), open_work: z.number(), blocked_work: z.number(), overdue_work: z.number(),
  completed_period: z.number(), milestones_done: z.number(), milestones_pending: z.number(), activity_period: z.number(), last_activity: time.nullable() })
export const projectsSchema = z.object({ items: z.array(projectRowSchema), total: z.number(), statuses: counts, as_of: time })
export const workSchema = z.object({ statuses: counts, priorities: counts, completed_period: z.number(),
  median_completion_days: z.number().nullable(), median_open_age_days: z.number().nullable(),
  series: z.array(z.object({ day: time, count: z.number() })), bucket: z.string(), as_of: time })
export const workDetailsSchema = z.object({ items: z.array(z.object({ id: uuid, project_id: uuid, project_name: z.string(),
  title: z.string(), status: z.string(), priority: z.string(), due_at: time.nullable(), completed_at: time.nullable() })), total: z.number(), as_of: time })
export const editorialSchema = z.object({ states: counts, channels: counts, formats: counts, as_of: time })
export const reviewsSchema = z.object({ statuses: counts, submitted_period: z.number(), internal_approved_period: z.number(),
  internal_changes_period: z.number(), published_period: z.number(), client_approved_period: z.number(), client_changes_period: z.number(),
  pending_internal: z.number(), pending_client: z.number(), median_internal_hours: z.number().nullable(), median_client_hours: z.number().nullable(),
  median_versions: z.number().nullable(), as_of: time })
export const billingSchema = z.object({ currencies: z.array(z.object({ currency: z.string(), issued_amount: z.number(), paid_amount: z.number(),
  remaining_amount: z.number(), partially_paid: z.number(), paid: z.number(), overdue: z.number(), upcoming_due: z.number() })), as_of: time })
export const billingDetailsSchema = z.object({ items: z.array(z.object({ id: uuid, number: z.string().nullable(), project_id: uuid.nullable(),
  document_date: time, due_date: time.nullable(), currency: z.string(), status: z.string(), total_amount: z.number(),
  paid_amount: z.number(), remaining_amount: z.number() })), total: z.number(), as_of: time })
export const reportRowSchema = z.object({ id: uuid, project_id: uuid, title: z.string(), from_date: time, to_date: time,
  published_at: time.nullable(), created_at: time })
export const reportsSchema = z.object({ items: z.array(reportRowSchema), total: z.number() })
export const clientReportSchema = z.object({ id: uuid, title: z.string(), project_id: uuid, project_name: z.string(), project_status: z.string(),
  from: time, to: time, published_at: time, as_of: time, semantics: z.literal('current_report'), milestones_done: z.number(),
  milestones_pending: z.number(), published_deliverables: z.number(), approvals: counts, published_documents: z.number() })
export const optionsSchema = z.object({ items: z.array(z.object({ id: uuid, name: z.string() })), total: z.number() })
export const labels: Record<string, string> = {
  planning: 'Planificación', active: 'Activo', on_hold: 'En pausa', completed: 'Completado', archived: 'Archivado',
  todo: 'Por hacer', in_progress: 'En curso', blocked: 'Bloqueado', done: 'Terminado', cancelled: 'Cancelado',
  low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente', planned: 'Planeado', available: 'Disponible', assigned: 'Asignado',
  draft: 'Borrador', in_review: 'En revisión interna', changes_requested: 'Cambios solicitados', ready_for_client: 'Aprobado internamente',
  published_to_client: 'Publicado al cliente', client_approved: 'Aprobado por cliente', pending: 'Pendiente', approved: 'Aprobado',
  issued: 'Emitido', partially_paid: 'Pago parcial', paid: 'Pagado', day: 'día', week: 'semana', month: 'mes',
}

// Escape every cell. A leading tab/newline/space must not hide a formula prefix.
export function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[\s\p{Cc}]*[=+\-@]/u.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}
export function analyticsCsv(data: unknown, filters: Filters, section: string) {
  const rows: unknown[][] = [['section', section], ...Object.entries(filters), ['metric', 'value']]
  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}.${index + 1}`))
    else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => visit(entry, path ? `${path}.${key}` : key))
    else rows.push([path, value])
  }
  visit(data, '')
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
