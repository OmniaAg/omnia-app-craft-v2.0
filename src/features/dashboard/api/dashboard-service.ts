import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Json, Tables } from '../../../shared/api/supabase/database.types'
import type { DashboardDocument } from '../model/dashboard'

export type DashboardConfigRow = Tables<'dashboard_user_configs'>

export type WorkItemSummary = {
  itemKind: string; itemId: string; title: string; priority: string; dueAt: string | null
  bucket?: string; projectId: string | null; projectName: string | null
}
export type OperationalSummary = {
  work: {
    counts: { total: number; overdue: number; today: number; upcoming: number; noDueDate: number }
    nextItems: WorkItemSummary[]; overdueItems: WorkItemSummary[]; todayItems: WorkItemSummary[]; upcomingItems: WorkItemSummary[]
  }
  projects: {
    activeCount: number; attentionCount: number
    items: Array<{ projectId: string; projectName: string; status: string; targetEndDate: string | null; brandName: string; organizationName: string }>
  }
}
export type CrmSummary = {
  opportunities: { openCount: number; items: Array<{ opportunityId: string; name: string; organizationId: string; organizationName: string; stageKey: string; estimatedValue: number | null; currency: string; expectedCloseDate: string | null }> }
  organizations: { totalCount: number; activeClientCount: number; items: Array<{ organizationId: string; name: string; lifecycle: string }> }
}

export class DashboardApiError extends Error {
  code?: string
  constructor(message: string, code?: string) { super(message); this.name = 'DashboardApiError'; this.code = code }
}

function fail(error: { message: string; code?: string } | null, fallback: string) {
  if (error) throw new DashboardApiError(error.message.includes('dashboard_revision_conflict') ? 'Tu dashboard cambió en otra sesión.' : fallback, error.code)
}

export async function loadDashboardConfig(client: OmniaSupabaseClient): Promise<DashboardConfigRow | null> {
  const { data, error } = await client.from('dashboard_user_configs').select('*').maybeSingle()
  fail(error, 'No pudimos cargar tu configuración de dashboard.')
  return data
}

export async function saveDashboardConfig(client: OmniaSupabaseClient, document: DashboardDocument) {
  const { data, error } = await client.rpc('save_dashboard_config', {
    expected_revision: document.revision,
    registry_version: document.registryVersion,
    widget_instances: document.instances as unknown as Json,
    responsive_layouts: document.layouts as unknown as Json,
  })
  fail(error, 'No pudimos guardar tu dashboard.')
  const row = data?.[0]
  if (!row) throw new DashboardApiError('El servidor no devolvió la configuración guardada.')
  return row
}

export async function resetDashboardConfig(client: OmniaSupabaseClient, revision: number) {
  const { data, error } = await client.rpc('reset_dashboard_config', { expected_revision: revision })
  fail(error, 'No pudimos restablecer tu dashboard.')
  return data
}

export async function loadOperationalSummary(client: OmniaSupabaseClient, maxItems = 6) {
  const { data, error } = await client.rpc('dashboard_operational_summary', { max_items: maxItems })
  fail(error, 'No pudimos cargar el resumen operativo.')
  return data as unknown as OperationalSummary
}

export async function loadCrmSummary(client: OmniaSupabaseClient, maxItems = 6) {
  const { data, error } = await client.rpc('dashboard_crm_summary', { max_items: maxItems })
  fail(error, 'No pudimos cargar el resumen de CRM.')
  return data as unknown as CrmSummary
}
