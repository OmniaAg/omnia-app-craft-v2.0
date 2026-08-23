import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'
import type { CommentFormValues, WorkItemFormValues } from '../model/schemas'

type FunctionRows<Name extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][Name]['Returns'] extends Array<infer Row> ? Row : never

export type ProjectWorkItem = FunctionRows<'project_work_items'>
export type WorkComment = FunctionRows<'work_item_comments_list'>
export type WorkEvent = FunctionRows<'work_item_event_list'>

export class WorkApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkApiError'
  }
}

function assertResult(error: { message: string } | null, fallback: string) {
  if (error) throw new WorkApiError(fallback)
}

const nullableString = (value?: string) => (value || null) as unknown as string

export async function listProjectWork(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('project_work_items', {
    project_id: projectId,
    page_limit: 100,
    page_offset: 0,
  })
  assertResult(error, 'No pudimos cargar el trabajo del proyecto.')
  return data ?? []
}

export async function listWorkComments(client: OmniaSupabaseClient, workItemId: string) {
  const { data, error } = await client.rpc('work_item_comments_list', {
    work_item_id: workItemId,
    page_limit: 50,
    page_offset: 0,
  })
  assertResult(error, 'No pudimos cargar los comentarios.')
  return data ?? []
}

export async function listWorkEvents(client: OmniaSupabaseClient, workItemId: string) {
  const { data, error } = await client.rpc('work_item_event_list', {
    work_item_id: workItemId,
    page_limit: 50,
  })
  assertResult(error, 'No pudimos cargar el historial.')
  return data ?? []
}

export async function createWorkItem(
  client: OmniaSupabaseClient,
  projectId: string,
  values: WorkItemFormValues,
) {
  const { data, error } = await client.rpc('create_work_item', {
    project_id: projectId,
    title: values.title,
    description: values.description ?? '',
    priority: values.priority,
    due_local: nullableString(values.dueLocal),
    milestone_id: nullableString(values.milestoneId),
    assignee_ids: values.assigneeIds,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear el trabajo. Verifica hito y responsables.')
  return data
}

export async function assignWorkItem(client: OmniaSupabaseClient, workItemId: string, assigneeIds: string[]) {
  const { data, error } = await client.rpc('assign_work_item', {
    work_item_id: workItemId,
    assignee_ids: assigneeIds,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos guardar los responsables.')
  return data
}

export async function transitionWorkItem(client: OmniaSupabaseClient, workItemId: string, status: string) {
  const { data, error } = await client.rpc('transition_work_item', {
    work_item_id: workItemId,
    status,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'La transición no está permitida desde el estado actual.')
  return data
}

export async function archiveWorkItem(client: OmniaSupabaseClient, workItemId: string) {
  const { data, error } = await client.rpc('archive_work_item', {
    work_item_id: workItemId,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos archivar este trabajo.')
  return data
}

export async function createWorkComment(
  client: OmniaSupabaseClient,
  workItemId: string,
  values: CommentFormValues,
) {
  const { data, error } = await client.rpc('create_work_item_comment', {
    work_item_id: workItemId,
    body: values.body,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos publicar el comentario.')
  return data
}
