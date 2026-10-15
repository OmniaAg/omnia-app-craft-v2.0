import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { aiRunSchema, automationSchema, connectionSchema, deliverySchema, pageSchema, projectOptionSchema, runDetailSchema, runSchema, safeMessage, type Automation } from './model'

const client = getSupabaseClient
const unwrap = <T,>(response: { data: T; error: { message: string } | null }) => {
  if (response.error) throw new Error(safeMessage(response.error.message))
  return response.data
}
export const phase13Keys = { all: ['phase13'] as const }
export const projectOptionsQuery = (actor: string, capability: 'automation.view' | 'integration.view' | 'ai.use') => queryOptions({
  queryKey: ['phase13', actor, 'projects', capability], staleTime: 60_000,
  queryFn: async () => z.array(projectOptionSchema).parse(unwrap(await client().rpc('phase13_projects', { p_capability: capability }))),
})
const schemas = { automations: automationSchema, runs: runSchema, connections: connectionSchema, deliveries: deliverySchema, ai: aiRunSchema }
export function historyQuery<K extends keyof typeof schemas>(actor: string, project: string, kind: K, page = 0) {
  const schema = pageSchema(schemas[kind])
  return queryOptions({ queryKey: ['phase13', actor, project, kind, page], staleTime: 15_000, enabled: Boolean(project),
    queryFn: async () => schema.parse(unwrap(await client().rpc('phase13_history', { p_project: project, p_kind: kind, p_limit: 20, p_offset: page * 20 }))) as { items: z.infer<(typeof schemas)[K]>[]; total: number },
  })
}
export const runDetailQuery = (actor: string, id: string) => queryOptions({ queryKey: ['phase13', actor, 'run', id], enabled: Boolean(id),
  queryFn: async () => runDetailSchema.parse(unwrap(await client().rpc('phase13_run_detail', { p_run: id }))),
})
export const aiConsentQuery = (actor: string, project: string) => queryOptions({ queryKey: ['phase13', actor, project, 'consent'], enabled: Boolean(project),
  queryFn: async () => { const result = await client().from('ai_project_consents').select('enabled').eq('project_id', project).maybeSingle(); return unwrap(result)?.enabled ?? false },
})
export const connectionOptionsQuery = (actor: string, project: string) => queryOptions({ queryKey: ['phase13', actor, project, 'connection-options'],
  queryFn: async () => z.array(connectionSchema).parse(unwrap(await client().from('integration_connections')
    .select('id,provider,display_name,event_allowlist,status,credentials_version,consented_at,created_at,last_health_check,last_health_status')
    .eq('project_id', project).eq('status', 'active').limit(50))),
})
export async function saveAutomation(project: string, values: Omit<Automation, 'id' | 'created_at' | 'created_by' | 'revision'>, id?: string) {
  const saved=unwrap(await client().rpc('phase13_save_automation', { p_project: project, p_name: values.name, p_enabled: values.enabled, p_trigger: values.trigger_type,
    p_event: values.event_type as unknown as string, p_conditions: values.conditions, p_actions: values.actions, p_key: crypto.randomUUID(), p_id: id }))
  if(!saved)throw new Error('No pudimos confirmar el workflow guardado.')
  return saved
}
export const disableConnection = async (id: string) => unwrap(await client().rpc('phase13_disable_connection', { p_connection: id }))
export const setAIConsent = async (project: string, enabled: boolean) => unwrap(await client().rpc('phase13_ai_consent', { p_project: project, p_enabled: enabled }))
export const approveDraft = async (id: string) => unwrap(await client().rpc('phase13_approve_ai_draft', { p_run: id }))
export async function invokePhase13(body: Record<string, unknown>) {
  const result = await client().functions.invoke('automation-api', { body })
  if (result.error) {
    const context = 'context' in result.error ? result.error.context : null
    let code = 'provider_unavailable'
    if (context instanceof Response) { try { code = (await context.json()).error } catch { /* Safe fallback. */ } }
    throw new Error(safeMessage(code))
  }
  if (result.data?.error) throw new Error(safeMessage(result.data.error))
  return result.data as { id: string; status?: string }
}
