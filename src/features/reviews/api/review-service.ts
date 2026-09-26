import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'

export type ReviewQueueItem = Database['public']['Functions']['review_queue']['Returns'][number]
export type ReviewAssignment = {
  id: string
  reviewer_id: string
  reviewer_name: string
  requirement_id: string
  requirement_scope: 'project' | 'deliverable'
  status: 'pending' | 'approved' | 'changes_requested' | 'overridden'
  resolved_at: string | null
  decision: 'approve' | 'request_changes' | null
  reason: string | null
  decided_at: string | null
  override_reason: string | null
  overridden_at: string | null
  override_director_id: string | null
}
export type ReviewVersion = {
  id: string
  version_number: number
  notes: string
  submitted_at: string
  submitted_by: string
  submitter_name: string
  round: { id: string; status: 'pending' | 'approved' | 'changes_requested'; opened_at: string; closed_at: string | null; assignments: ReviewAssignment[] }
}
export type DeliverableDetail = {
  work: { id: string; project_id: string; title: string; status: string; archived_at: string | null }
  deliverable: { id: string; title: string; status: string; created_at: string; published_at: string | null } | null
  can_create: boolean
  can_submit: boolean
  can_publish: boolean
  can_override: boolean
  versions: ReviewVersion[]
}
export type ReviewConfiguration = {
  can_configure: boolean
  requirements: { id: string; reviewer_id: string; reviewer_name: string; scope: string }[]
  candidates: { user_id: string; display_name: string }[]
}

function unwrap<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error || data === null) throw new Error(error?.message ?? message)
  return data
}

export async function listReviewQueue(client: OmniaSupabaseClient, page: number) {
  const { data, error } = await client.rpc('review_queue', { page_limit: 50, page_offset: page * 50 })
  return unwrap(data, error, 'No pudimos cargar tus revisiones.')
}

export async function getDeliverableDetail(client: OmniaSupabaseClient, workItemId: string) {
  const { data, error } = await client.rpc('deliverable_detail', { work_item_id: workItemId })
  return unwrap(data, error, 'No pudimos cargar la entrega.') as DeliverableDetail
}

export async function getReviewConfiguration(client: OmniaSupabaseClient, projectId: string, deliverableId: string | null = null) {
  const { data, error } = await client.rpc('review_configuration', {
    project_id: projectId, ...(deliverableId ? { deliverable_id: deliverableId } : {}),
  })
  return unwrap(data, error, 'No pudimos cargar los revisores.') as ReviewConfiguration
}

export async function configureReviewers(client: OmniaSupabaseClient, projectId: string, deliverableId: string | null, reviewerIds: string[], key: string) {
  const { data, error } = await client.rpc('configure_review_requirements', {
    project_id: projectId, deliverable_id: deliverableId as unknown as string,
    reviewer_ids: reviewerIds, idempotency_key: key,
  })
  return unwrap(data, error, 'No pudimos guardar los revisores.')
}

export async function createDeliverable(client: OmniaSupabaseClient, workItemId: string, title: string, key: string) {
  const { data, error } = await client.rpc('create_deliverable', { work_item_id: workItemId, title, idempotency_key: key })
  return unwrap(data, error, 'No pudimos crear la entrega.')
}

export async function submitVersion(client: OmniaSupabaseClient, deliverableId: string, notes: string, key: string) {
  const { data, error } = await client.rpc('submit_deliverable_version', { deliverable_id: deliverableId, notes, idempotency_key: key })
  return unwrap(data, error, 'No pudimos enviar la versión. Confirma que hay revisores configurados y activos.')
}

export async function recordDecision(client: OmniaSupabaseClient, assignmentId: string, decision: 'approve' | 'request_changes', reason: string, key: string) {
  const { data, error } = await client.rpc('record_review_decision', {
    review_assignment_id: assignmentId, decision, reason, idempotency_key: key,
  })
  return unwrap(data, error, 'No pudimos guardar la decisión.')
}

export async function overrideRequirement(client: OmniaSupabaseClient, assignmentId: string, reason: string, key: string) {
  const { data, error } = await client.rpc('override_review_requirement', {
    review_assignment_id: assignmentId, reason, idempotency_key: key,
  })
  return unwrap(data, error, 'No pudimos registrar la excepción.')
}

export async function publishDeliverable(client: OmniaSupabaseClient, deliverableId: string, key: string) {
  const { data, error } = await client.rpc('publish_deliverable_to_client', { deliverable_id: deliverableId, idempotency_key: key })
  return unwrap(data, error, 'No pudimos publicar la entrega.')
}
