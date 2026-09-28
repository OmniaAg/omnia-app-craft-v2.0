import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'

type Functions = Database['public']['Functions']
export type PortalProject = Functions['portal_projects']['Returns'][number]
export type PortalDeliverable = Functions['portal_deliverables']['Returns'][number]
export type PortalApproval = Functions['portal_approvals']['Returns'][number]
export type PortalDocument = Functions['portal_documents']['Returns'][number]
export type PortalNotification = Pick<Database['public']['Tables']['notifications']['Row'],
  'id' | 'kind' | 'project_id' | 'deliverable_id' | 'created_at' | 'read_at'>
export type PortalProjectDetail = {
  id: string; name: string; status: string; brand_name: string; organization_name: string
  start_date: string | null; target_end_date: string | null; timezone: string
  milestones: { id: string; name: string; status: string; due_date: string | null }[]
  activity: { publication_id: string; title: string; published_at: string; review_status: string }[]
}
export type PortalDeliverableDetail = {
  publication_id: string; deliverable_id: string; project_id: string; project_name: string
  brand_name: string; title: string; version_number: number; published_at: string
  review_status: string; my_assignment_id: string | null; my_assignment_status: string | null
  files: { id: string; bucket_id: string; object_path: string; original_filename: string
    mime_type: string; size_bytes: number }[]
  feedback: { id: string; body: string; created_at: string; author_name: string }[]
}

function unwrap<T>(data: T | null, error: { message: string } | null, fallback: string): T {
  if (error || data === null) throw new Error(error?.message ?? fallback)
  return data
}

export const PORTAL_PAGE_SIZE = 20

export async function listPortalProjects(client: OmniaSupabaseClient, page: number) {
  const { data, error } = await client.rpc('portal_projects', { page_limit: PORTAL_PAGE_SIZE, page_offset: page * PORTAL_PAGE_SIZE })
  return unwrap(data, error, 'No pudimos cargar los proyectos.')
}

export async function getPortalProject(client: OmniaSupabaseClient, projectId: string) {
  const { data, error } = await client.rpc('portal_project_detail', { project_id: projectId })
  return unwrap(data, error, 'No pudimos cargar el proyecto.') as PortalProjectDetail
}

export async function listPortalDeliverables(client: OmniaSupabaseClient, page: number, projectId?: string) {
  const { data, error } = await client.rpc('portal_deliverables', {
    page_limit: PORTAL_PAGE_SIZE, page_offset: page * PORTAL_PAGE_SIZE,
    ...(projectId ? { p_project_id: projectId } : {}),
  })
  return unwrap(data, error, 'No pudimos cargar las entregas.')
}

export async function getPortalDeliverable(client: OmniaSupabaseClient, publicationId: string) {
  const { data, error } = await client.rpc('portal_deliverable_detail', { publication_id: publicationId })
  return unwrap(data, error, 'No pudimos cargar la entrega.') as PortalDeliverableDetail
}

export async function listPortalApprovals(client: OmniaSupabaseClient, page: number) {
  const { data, error } = await client.rpc('portal_approvals', { page_limit: PORTAL_PAGE_SIZE, page_offset: page * PORTAL_PAGE_SIZE })
  return unwrap(data, error, 'No pudimos cargar las aprobaciones.')
}

export async function listPortalDocuments(client: OmniaSupabaseClient, page: number, projectId?: string) {
  const { data, error } = await client.rpc('portal_documents', {
    page_limit: PORTAL_PAGE_SIZE, page_offset: page * PORTAL_PAGE_SIZE,
    ...(projectId ? { p_project_id: projectId } : {}),
  })
  return unwrap(data, error, 'No pudimos cargar los documentos.')
}

export async function listPortalBillingDocuments(client: OmniaSupabaseClient, page: number) {
  const { data, error } = await client.from('client_billing_projections')
    .select('*')
    .order('published_at', { ascending: false })
    .range(page * PORTAL_PAGE_SIZE, (page + 1) * PORTAL_PAGE_SIZE - 1)
  return unwrap(data, error, 'No pudimos cargar los documentos de facturación.')
}

export async function listPortalNotifications(client: OmniaSupabaseClient, page = 0) {
  const { data, error } = await client.from('notifications')
    .select('id,kind,project_id,deliverable_id,created_at,read_at')
    .order('created_at', { ascending: false }).range(page * PORTAL_PAGE_SIZE, (page + 1) * PORTAL_PAGE_SIZE - 1)
  return unwrap(data, error, 'No pudimos cargar las notificaciones.') as PortalNotification[]
}

export async function markNotificationRead(client: OmniaSupabaseClient, id: string) {
  const { error } = await client.rpc('mark_portal_notification_read', { notification_id: id })
  if (error) throw new Error(error.message)
}

export async function recordClientDecision(client: OmniaSupabaseClient, assignmentId: string,
  decision: 'approve' | 'request_changes', reason: string, key: string) {
  const { data, error } = await client.rpc('record_client_decision', {
    assignment_id: assignmentId, decision, reason, idempotency_key: key,
  })
  return unwrap(data, error, 'No pudimos registrar la decisión.')
}

export async function addClientFeedback(client: OmniaSupabaseClient, publicationId: string, body: string, key: string) {
  const { data, error } = await client.rpc('add_client_feedback', {
    publication_id: publicationId, body, idempotency_key: key,
  })
  return unwrap(data, error, 'No pudimos enviar el comentario.')
}
