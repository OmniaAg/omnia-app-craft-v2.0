import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'
import type { MilestoneFormValues, ProjectFormValues } from '../model/schemas'
import { PROJECT_PAGE_SIZE } from '../model/schemas'

type FunctionRows<Name extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][Name]['Returns'] extends Array<infer Row> ? Row : never

export type ProjectListItem = FunctionRows<'list_projects'>
export type ProjectDetail = FunctionRows<'project_detail'>
export type ProjectMember = FunctionRows<'project_members'>
export type ProjectMemberCandidate = FunctionRows<'project_member_candidates'>
export type ProjectMilestone = FunctionRows<'project_milestones'>
export type ProjectBrandOption = FunctionRows<'project_brand_options'>

export type ProjectPage = {
  items: ProjectListItem[]
  total: number
  page: number
  pageSize: number
}

export class ProjectApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectApiError'
  }
}

function assertResult(error: { message: string } | null, fallback: string) {
  if (error) throw new ProjectApiError(fallback)
}

const nullableString = (value?: string) => (value || null) as unknown as string

export async function listProjects(
  client: OmniaSupabaseClient,
  input: { page: number; search: string; status: string },
): Promise<ProjectPage> {
  const { data, error } = await client.rpc('list_projects', {
    search_text: input.search.trim().slice(0, 120),
    status_filter: input.status === 'all' ? '' : input.status,
    page_limit: PROJECT_PAGE_SIZE,
    page_offset: input.page * PROJECT_PAGE_SIZE,
  })
  assertResult(error, 'No pudimos cargar los proyectos autorizados.')
  const items = data ?? []
  return {
    items,
    total: items[0]?.total_count ?? 0,
    page: input.page,
    pageSize: PROJECT_PAGE_SIZE,
  }
}

export async function listProjectBrandOptions(client: OmniaSupabaseClient) {
  const { data, error } = await client.rpc('project_brand_options')
  assertResult(error, 'No pudimos cargar las marcas disponibles.')
  return data ?? []
}

export async function getProjectDetail(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('project_detail', { project_id: projectId })
  assertResult(error, 'No pudimos abrir el proyecto. Confirma que sigues siendo miembro.')
  const project = data?.[0]
  if (!project) throw new ProjectApiError('El proyecto no existe o está fuera de tu alcance.')
  return project
}

export async function listProjectMembers(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('project_members', { project_id: projectId })
  assertResult(error, 'No pudimos cargar los miembros del proyecto.')
  return data ?? []
}

export async function listProjectMemberCandidates(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('project_member_candidates', { project_id: projectId })
  assertResult(error, 'No pudimos cargar las personas disponibles.')
  return data ?? []
}

export async function listProjectMilestones(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('project_milestones', { project_id: projectId })
  assertResult(error, 'No pudimos cargar los hitos del proyecto.')
  return data ?? []
}

export async function createProject(client: OmniaSupabaseClient, values: ProjectFormValues) {
  const { data, error } = await client.rpc('create_project', {
    brand_id: values.brandId,
    name: values.name,
    description: values.description ?? '',
    status: values.status,
    start_date: nullableString(values.startDate),
    target_end_date: nullableString(values.targetEndDate),
    timezone: values.timezone,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear el proyecto. Revisa la marca y tu capability.')
  return data
}

export async function archiveProject(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('archive_project', {
    project_id: projectId,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos archivar el proyecto.')
  return data
}

export async function addProjectMember(
  client: OmniaSupabaseClient,
  projectId: string,
  candidate: ProjectMemberCandidate,
) {
  const { data, error } = await client.rpc('add_project_member', {
    project_id: projectId,
    user_id: candidate.user_id,
    member_type: candidate.member_type,
    responsibility: candidate.suggested_responsibility,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos añadir a la persona. Verifica su membership vigente.')
  return data
}

export async function revokeProjectMember(client: OmniaSupabaseClient, membershipId: string) {
  const { data, error } = await client.rpc('revoke_project_member', {
    membership_id: membershipId,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos revocar la membership del proyecto.')
  return data
}

export async function createMilestone(
  client: OmniaSupabaseClient,
  projectId: string,
  values: MilestoneFormValues,
) {
  const { data, error } = await client.rpc('create_milestone', {
    project_id: projectId,
    name: values.name,
    description: values.description ?? '',
    due_date: nullableString(values.dueDate),
    sort_order: Number(values.sortOrder),
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear el hito.')
  return data
}
