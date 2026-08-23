import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Tables } from '../../../shared/api/supabase/database.types'
import type {
  ActivityFormValues,
  BrandFormValues,
  ContactFormValues,
  OpportunityFormValues,
  OrganizationFormValues,
} from '../model/schemas'
import { PAGE_SIZE } from '../model/schemas'

export type Organization = Tables<'organizations'>
export type Brand = Tables<'brands'>
export type Contact = Tables<'contacts'>
export type Opportunity = Tables<'opportunities'>
export type PipelineStage = Tables<'pipeline_stages'>
export type CrmActivity = Tables<'crm_activities'>

export type PageResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ContactListItem = Contact & {
  organizations: { name: string } | null
}

export type OpportunityListItem = Opportunity & {
  organizations: { name: string } | null
  brands: { name: string } | null
  pipeline_stages: { label: string; sort_order: number } | null
}

export class CrmApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrmApiError'
  }
}

function assertResult(error: { message: string } | null, fallback: string) {
  if (error) throw new CrmApiError(fallback)
}

function searchTerm(value: string): string {
  return value.trim().slice(0, 120)
}

export async function listOrganizations(
  client: OmniaSupabaseClient,
  input: { page: number; search: string; lifecycle: string },
): Promise<PageResult<Organization>> {
  const from = input.page * PAGE_SIZE
  let query = client
    .from('organizations')
    .select('id,agency_id,name,domain,normalized_domain,lifecycle,timezone,created_at,updated_at,archived_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const term = searchTerm(input.search)
  if (term) query = query.ilike('name', `%${term}%`)
  if (input.lifecycle !== 'all') query = query.eq('lifecycle', input.lifecycle)

  const { data, count, error } = await query
  assertResult(error, 'No pudimos cargar las organizaciones.')
  return { items: data ?? [], total: count ?? 0, page: input.page, pageSize: PAGE_SIZE }
}

export async function getOrganization(client: OmniaSupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from('organizations')
    .select('id,agency_id,name,domain,normalized_domain,lifecycle,timezone,created_at,updated_at,archived_at')
    .eq('id', organizationId)
    .maybeSingle()
  assertResult(error, 'No pudimos cargar la organización.')
  if (!data) throw new CrmApiError('La organización no existe o está fuera de tu scope.')
  return data
}

export async function listBrands(client: OmniaSupabaseClient, organizationId: string) {
  const { data, error } = await client.from('brands').select('*').eq('organization_id', organizationId).order('name')
  assertResult(error, 'No pudimos cargar las marcas.')
  return data ?? []
}

export async function listContacts(
  client: OmniaSupabaseClient,
  input: { page: number; search: string; status: string; organizationId?: string },
): Promise<PageResult<ContactListItem>> {
  const from = input.page * PAGE_SIZE
  let query = client
    .from('contacts')
    .select('*,organizations(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  const term = searchTerm(input.search)
  if (term) query = query.ilike('full_name', `%${term}%`)
  if (input.status !== 'all') query = query.eq('status', input.status)
  if (input.organizationId) query = query.eq('organization_id', input.organizationId)
  const { data, count, error } = await query
  assertResult(error, 'No pudimos cargar los contactos.')
  return { items: data ?? [], total: count ?? 0, page: input.page, pageSize: PAGE_SIZE }
}

export async function listOpportunities(
  client: OmniaSupabaseClient,
  input: { page: number; search: string; status: string; organizationId?: string },
): Promise<PageResult<OpportunityListItem>> {
  const from = input.page * PAGE_SIZE
  let query = client
    .from('opportunities')
    .select('*,organizations(name),brands(name),pipeline_stages(label,sort_order)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  const term = searchTerm(input.search)
  if (term) query = query.ilike('name', `%${term}%`)
  if (input.status !== 'all') query = query.eq('status', input.status)
  if (input.organizationId) query = query.eq('organization_id', input.organizationId)
  const { data, count, error } = await query
  assertResult(error, 'No pudimos cargar las oportunidades.')
  return { items: data ?? [], total: count ?? 0, page: input.page, pageSize: PAGE_SIZE }
}

export async function listActivities(client: OmniaSupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from('crm_activities')
    .select('*')
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })
    .limit(50)
  assertResult(error, 'No pudimos cargar la actividad.')
  return data ?? []
}

export async function listPipelineStages(client: OmniaSupabaseClient) {
  const { data, error } = await client.from('pipeline_stages').select('*').eq('is_active', true).order('sort_order')
  assertResult(error, 'No pudimos cargar las etapas del pipeline.')
  return data ?? []
}

export async function createOrganization(client: OmniaSupabaseClient, values: OrganizationFormValues) {
  const { data, error } = await client.rpc('create_crm_organization', {
    name: values.name,
    domain: values.domain ?? '',
    timezone: values.timezone ?? 'America/Mexico_City',
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear la organización. Revisa el dominio y tu capability.')
  return data
}

export async function updateOrganization(client: OmniaSupabaseClient, organizationId: string, values: OrganizationFormValues) {
  const { data, error } = await client.rpc('update_organization', {
    organization_id: organizationId,
    name: values.name,
    domain: values.domain ?? '',
    timezone: values.timezone ?? 'America/Mexico_City',
    lifecycle: values.lifecycle ?? 'prospect',
  })
  assertResult(error, 'No pudimos guardar la organización.')
  return data
}

export async function promoteOrganization(client: OmniaSupabaseClient, organizationId: string) {
  const { data, error } = await client.rpc('promote_organization_to_client', {
    organization_id: organizationId,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos promover la organización. Verifica que sea prospect y tenga una marca activa.')
  return data
}

export async function createBrand(client: OmniaSupabaseClient, organizationId: string, values: BrandFormValues) {
  const { data, error } = await client.rpc('create_brand', {
    organization_id: organizationId,
    name: values.name,
    timezone: values.timezone ?? '',
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear la marca.')
  return data
}

export async function createContact(client: OmniaSupabaseClient, organizationId: string, values: ContactFormValues) {
  const { data, error } = await client.rpc('create_contact', {
    organization_id: organizationId,
    full_name: values.fullName,
    email: values.email ?? '',
    phone: values.phone ?? '',
    job_title: values.jobTitle ?? '',
    notes: values.notes ?? '',
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear el contacto. Verifica que el correo no esté duplicado.')
  return data
}

export async function createOpportunity(
  client: OmniaSupabaseClient,
  organizationId: string,
  ownerId: string,
  values: OpportunityFormValues,
) {
  const { data, error } = await client.rpc('create_opportunity', {
    organization_id: organizationId,
    brand_id: (values.brandId || null) as unknown as string,
    name: values.name,
    stage_key: values.stageKey,
    estimated_value: (values.estimatedValue ? Number(values.estimatedValue) : null) as unknown as number,
    currency: values.currency,
    owner_id: ownerId,
    expected_close_date: (values.expectedCloseDate || null) as unknown as string,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos crear la oportunidad.')
  return data
}

export async function changeOpportunityStage(client: OmniaSupabaseClient, opportunityId: string, stageKey: string) {
  const { data, error } = await client.rpc('change_opportunity_stage', {
    opportunity_id: opportunityId,
    stage_key: stageKey,
    idempotency_key: crypto.randomUUID(),
  })
  assertResult(error, 'No pudimos cambiar la etapa.')
  return data
}

export async function createActivity(client: OmniaSupabaseClient, organizationId: string, values: ActivityFormValues) {
  const { data, error } = await client.rpc('create_crm_activity', {
    organization_id: organizationId,
    activity_type: values.activityType,
    summary: values.summary,
    details: values.details ?? '',
    brand_id: null as unknown as string,
    contact_id: null as unknown as string,
    opportunity_id: null as unknown as string,
  })
  assertResult(error, 'No pudimos registrar la actividad.')
  return data
}
