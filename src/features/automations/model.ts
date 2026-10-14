import { z } from 'zod'

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create_work_item'), title: z.string().trim().min(1).max(160), priority: z.enum(['low', 'normal', 'high', 'urgent']) }).strict(),
  z.object({ type: z.literal('outbound_webhook'), connection_id: z.guid() }).strict(),
])
export const conditionSchema = z.object({ field: z.enum(['event_type', 'project_id', 'resource_type', 'status']), operator: z.enum(['equals', 'exists', 'contains']), value: z.string().max(120).optional() }).strict()
export const automationSchema = z.object({
  id: z.guid(), name: z.string(), enabled: z.boolean(), trigger_type: z.enum(['manual', 'domain_event']), event_type: z.string().nullable(),
  conditions: z.array(conditionSchema), actions: z.array(actionSchema), revision: z.number(), created_by: z.guid(), created_at: z.string(),
})
export type Automation = z.infer<typeof automationSchema>
export type Action = z.infer<typeof actionSchema>
export const runSchema = z.object({
  id: z.guid(), automation_id: z.guid(), owner_id: z.guid(), event_id: z.guid().nullable(), status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  attempt: z.number(), max_attempt: z.number(), manual_retries: z.number(), correlation_id: z.guid(), causation_id: z.guid().nullable(), depth: z.number(),
  started_at: z.string().nullable(), finished_at: z.string().nullable(), safe_error: z.string().nullable(), created_at: z.string(), next_attempt_at: z.string(), revision: z.number(),
})
export const connectionSchema = z.object({
  id: z.guid(), provider: z.literal('generic_webhook'), display_name: z.string(), event_allowlist: z.array(z.string()), status: z.enum(['pending', 'active', 'disabled']),
  credentials_version: z.number(), consented_at: z.string(), created_at: z.string(), last_health_check: z.string().nullable(), last_health_status: z.string().nullable(),
})
export type Connection = z.infer<typeof connectionSchema>
export const deliverySchema = z.object({
  id: z.guid(), connection_id: z.guid(), step_id: z.guid().nullable(), event_id: z.guid().nullable(), status: z.string(), attempt: z.number(),
  safe_error: z.string().nullable(), last_http_status: z.number().nullable(), created_at: z.string(), finished_at: z.string().nullable(), attempts: z.array(z.unknown()),
})
export const aiResultSchema = z.union([
  z.object({ summary: z.string(), open_work: z.number(), completed_work: z.number() }).strict(),
  z.object({ title: z.string(), description: z.string(), priority: z.enum(['low', 'normal', 'high', 'urgent']) }).strict(),
])
export const aiRunSchema = z.object({
  id: z.guid(), task_type: z.enum(['project_summary', 'draft_work']), provider: z.string(), model: z.string(), template_key: z.string(), template_version: z.number(),
  status: z.string(), result: aiResultSchema.nullable(), safe_error: z.string().nullable(), context_counts: z.object({ work_items: z.number() }),
  input_tokens: z.number().nullable(), output_tokens: z.number().nullable(), approved_work_item_id: z.guid().nullable(), started_at: z.string(), finished_at: z.string().nullable(),
})
export type AIRun = z.infer<typeof aiRunSchema>
export const projectOptionSchema = z.object({ id: z.guid(), name: z.string(), organization_id: z.guid(), organization_name: z.string(), can_manage: z.boolean(), can_run: z.boolean() })
export const runDetailSchema = z.object({ id: z.guid(), steps: z.array(z.object({ id: z.guid(), position: z.number(), action: z.string(), status: z.string(), attempt: z.number(), safe_error: z.string().nullable(), result_resource_id: z.guid().nullable(), attempts: z.array(z.unknown()) })) })
export const pageSchema = <T extends z.ZodType>(schema: T) => z.object({ items: z.array(schema), total: z.number() })
export const EVENT_TYPES = ['work.created', 'work.completed', 'work.status_changed', 'deliverable.published_to_client', 'review.changes_requested'] as const
const errors: Record<string, string> = {
  unauthorized: 'Tu sesión o tus permisos no autorizan esta operación.', consent_required: 'Dirección debe habilitar la asistencia para este proyecto.',
  provider_unavailable: 'El proveedor no está disponible. Intenta nuevamente.', rate_limited: 'Se alcanzó el límite por minuto. Espera antes de intentar de nuevo.',
  concurrency_limited: 'Ya hay dos solicitudes en curso. Espera a que terminen.', invalid_result: 'El proveedor devolvió un resultado inválido.',
  configuration_missing: 'Falta configuración del servidor. Revisa el environment local.', endpoint_forbidden: 'El destino no está permitido por la configuración del servidor.',
  network_timeout: 'El destino no respondió dentro del tiempo permitido.', invalid_credentials: 'El destino rechazó las credenciales.',
  authorization_revoked: 'Los permisos del propietario o el workflow ya no están activos.', invalid_configuration: 'La configuración fue rechazada. Revisa el proyecto y las acciones.',
  provider_rejected: 'El destino rechazó la entrega.', worker_timeout: 'El worker agotó su lease.', retry_not_allowed: 'Este intento no permite más reintentos.',
  automation_disabled: 'Habilita el workflow antes de ejecutarlo.', input_too_large: 'El texto excede el límite de entrada.',
}
export const safeMessage = (code: string | null | undefined) => code ? errors[code] ?? 'No pudimos completar la operación.' : ''
export const statusLabel = (status: string) => ({ pending: 'Pendiente', running: 'En ejecución', succeeded: 'Completada', failed: 'Fallida', cancelled: 'Cancelada', active: 'Activa', disabled: 'Deshabilitada', delivered: 'Entregada', attempting: 'Enviando', skipped: 'Omitido' })[status] ?? status
export const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value)) : '—'
