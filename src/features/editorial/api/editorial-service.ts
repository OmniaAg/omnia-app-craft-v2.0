import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'

type Rows<Name extends keyof Database['public']['Functions']> = Database['public']['Functions'][Name]['Returns'] extends Array<infer Row> ? Row : never
export type EditorialRow = Rows<'editorial_calendar'>
export type ApplicationRow = Rows<'editorial_applications'>
export type CycleRow = Database['public']['Tables']['editorial_cycles']['Row']
export type TemplateRow = Database['public']['Tables']['content_templates']['Row']
export type ProjectOption = Pick<Database['public']['Tables']['projects']['Row'], 'id' | 'name'>

function result<T>(data: T, error: { message: string } | null, message: string): T {
  if (error) throw new Error(message)
  return data
}
const nullableString = (value: string) => (value || null) as unknown as string

export async function projectOptions(client: OmniaSupabaseClient): Promise<ProjectOption[]> {
  const { data, error } = await client.from('projects').select('id,name').is('archived_at', null).order('name')
  return result(data ?? [], error, 'No se pudieron cargar los proyectos.')
}

export async function templates(client: OmniaSupabaseClient, projectId: string): Promise<TemplateRow[]> {
  const { data, error } = await client.from('content_templates').select('*').eq('project_id', projectId).order('name')
  return result(data ?? [], error, 'No se pudieron cargar las plantillas.')
}

export async function cycles(client: OmniaSupabaseClient, projectId: string): Promise<CycleRow[]> {
  const { data, error } = await client.from('editorial_cycles').select('*').eq('project_id', projectId).order('start_date', { ascending: false })
  return result(data ?? [], error, 'No se pudieron cargar los ciclos.')
}

export async function calendar(client: OmniaSupabaseClient, input: { from: string; to: string; projectId?: string; state?: string; channel?: string }): Promise<EditorialRow[]> {
  const { data, error } = await client.rpc('editorial_calendar', {
    date_from: input.from,
    date_to: input.to,
    project_filter: input.projectId || undefined,
    state_filter: input.state || undefined,
    channel_filter: input.channel || undefined,
  })
  return result(data ?? [], error, 'No se pudo cargar la agenda editorial.')
}

export async function applications(client: OmniaSupabaseClient, itemId: string): Promise<ApplicationRow[]> {
  const { data, error } = await client.rpc('editorial_applications', { item_id: itemId })
  return result(data ?? [], error, 'No se pudieron cargar las postulaciones.')
}

export async function createTemplate(client: OmniaSupabaseClient, input: { projectId: string; name: string; channel: string; format: string; brief: string }) {
  const { data, error } = await client.rpc('create_content_template', { project_id: input.projectId, name: input.name, default_channel: nullableString(input.channel), default_format: nullableString(input.format), default_brief: input.brief })
  return result(data, error, 'No se pudo crear la plantilla.')
}

export async function updateTemplate(client: OmniaSupabaseClient, input: { id: string; name: string; channel: string; format: string; brief: string; archive?: boolean }) {
  const { data, error } = await client.rpc('update_content_template', { template_id: input.id, name: input.name, default_channel: nullableString(input.channel), default_format: nullableString(input.format), default_brief: input.brief, archive: input.archive ?? false })
  return result(data, error, 'No se pudo guardar la plantilla.')
}

export async function createCycle(client: OmniaSupabaseClient, input: { projectId: string; name: string; from: string; to: string }) {
  const { data, error } = await client.rpc('create_editorial_cycle', { project_id: input.projectId, name: input.name, start_date: input.from, end_date: input.to })
  return result(data, error, 'No se pudo crear el ciclo.')
}

export async function updateCycle(client: OmniaSupabaseClient, input: { id: string; name: string; from: string; to: string; status: string }) {
  const { data, error } = await client.rpc('update_editorial_cycle', { cycle_id: input.id, name: input.name, start_date: input.from, end_date: input.to, status: input.status })
  return result(data, error, 'No se pudo guardar el ciclo.')
}

export async function createItem(client: OmniaSupabaseClient, input: { projectId: string; cycleId: string; templateId: string; title: string; brief: string; date: string; time: string; channel: string; format: string }) {
  const { data, error } = await client.rpc('create_editorial_item', { project_id: input.projectId, cycle_id: input.cycleId, template_id: nullableString(input.templateId), title: input.title, brief: input.brief, scheduled_date: input.date, scheduled_time: nullableString(input.time), channel: nullableString(input.channel), format: nullableString(input.format), idempotency_key: crypto.randomUUID() })
  return result(data, error, 'No se pudo crear la pieza.')
}

export async function updateItem(client: OmniaSupabaseClient, input: { id: string; title: string; brief: string; date: string; time: string; channel: string; format: string }) {
  const { data, error } = await client.rpc('update_editorial_item', { item_id: input.id, title: input.title, brief: input.brief, scheduled_date: input.date, scheduled_time: nullableString(input.time), channel: input.channel, format: input.format })
  return result(data, error, 'No se pudo guardar la pieza.')
}

export async function itemCommand(client: OmniaSupabaseClient, command: 'publish' | 'apply' | 'archive', itemId: string) {
  const response = command === 'publish' ? await client.rpc('publish_editorial_available', { item_id: itemId })
    : command === 'apply' ? await client.rpc('apply_to_editorial_work', { item_id: itemId })
      : await client.rpc('archive_editorial_item', { item_id: itemId })
  return result(response.data, response.error, 'No se pudo completar la acción editorial.')
}

export async function acceptApplication(client: OmniaSupabaseClient, applicationId: string) {
  const { data, error } = await client.rpc('accept_editorial_application', { application_id: applicationId })
  return result(data, error, 'No se pudo aceptar la postulación.')
}
