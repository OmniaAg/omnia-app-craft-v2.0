import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import {
  getOrganization,
  listActivities,
  listBrands,
  listContacts,
  listOpportunities,
  listOrganizations,
  listPipelineStages,
} from './crm-service'

export const crmKeys = {
  all: ['crm'] as const,
  organizations: (filters: { page: number; search: string; lifecycle: string }) =>
    [...crmKeys.all, 'organizations', { scope: 'authorized', sort: 'created_desc', ...filters }] as const,
  organization: (id: string) => [...crmKeys.all, 'organization', id] as const,
  brands: (organizationId: string) => [...crmKeys.organization(organizationId), 'brands'] as const,
  contacts: (filters: { page: number; search: string; status: string; organizationId?: string }) =>
    [...crmKeys.all, 'contacts', { scope: filters.organizationId ?? 'authorized', sort: 'created_desc', ...filters }] as const,
  opportunities: (filters: { page: number; search: string; status: string; organizationId?: string }) =>
    [...crmKeys.all, 'opportunities', { scope: filters.organizationId ?? 'authorized', sort: 'created_desc', ...filters }] as const,
  activities: (organizationId: string) => [...crmKeys.organization(organizationId), 'activities'] as const,
  stages: () => [...crmKeys.all, 'pipeline-stages'] as const,
}

export const organizationsQuery = (filters: { page: number; search: string; lifecycle: string }) =>
  queryOptions({ queryKey: crmKeys.organizations(filters), queryFn: () => listOrganizations(getSupabaseClient(), filters) })

export const organizationQuery = (id: string) =>
  queryOptions({ queryKey: crmKeys.organization(id), queryFn: () => getOrganization(getSupabaseClient(), id) })

export const brandsQuery = (organizationId: string) =>
  queryOptions({ queryKey: crmKeys.brands(organizationId), queryFn: () => listBrands(getSupabaseClient(), organizationId) })

export const contactsQuery = (filters: { page: number; search: string; status: string; organizationId?: string }) =>
  queryOptions({ queryKey: crmKeys.contacts(filters), queryFn: () => listContacts(getSupabaseClient(), filters) })

export const opportunitiesQuery = (filters: { page: number; search: string; status: string; organizationId?: string }) =>
  queryOptions({ queryKey: crmKeys.opportunities(filters), queryFn: () => listOpportunities(getSupabaseClient(), filters) })

export const activitiesQuery = (organizationId: string) =>
  queryOptions({ queryKey: crmKeys.activities(organizationId), queryFn: () => listActivities(getSupabaseClient(), organizationId) })

export const pipelineStagesQuery = () =>
  queryOptions({ queryKey: crmKeys.stages(), queryFn: () => listPipelineStages(getSupabaseClient()), staleTime: 5 * 60_000 })
