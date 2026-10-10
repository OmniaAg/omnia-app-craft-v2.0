import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import type { Filters } from './model'
import { billingDetailsSchema, billingSchema, clientReportSchema, editorialSchema, optionsSchema,
  overviewSchema, projectsSchema, reportsSchema, reviewsSchema, workDetailsSchema, workSchema } from './model'

export const analyticsKeys = { all: ['analytics'] as const }
export const args = (f: Filters) => ({ p_from: f.from, p_to: f.to, p_agency: f.agency,
  p_organization: f.organization, p_brand: f.brand, p_project: f.project })
const unwrap = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data }
export const analyticsQueries = {
  overview: (actor: string, f: Filters) => queryOptions({ queryKey: ['analytics', actor, 'overview', f], staleTime: 60_000,
    queryFn: async () => overviewSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_overview', args(f)))) }),
  projects: (actor: string, f: Filters, page: number) => queryOptions({ queryKey: ['analytics', actor, 'projects', f, page], staleTime: 60_000,
    queryFn: async () => projectsSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_projects', { ...args(f), p_offset: page * 20 }))) }),
  work: (actor: string, f: Filters) => queryOptions({ queryKey: ['analytics', actor, 'work', f], staleTime: 60_000,
    queryFn: async () => workSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_work', args(f)))) }),
  workDetails: (actor: string, f: Filters, filter: string, page: number) => queryOptions({ queryKey: ['analytics', actor, 'work-details', f, filter, page], staleTime: 60_000,
    queryFn: async () => workDetailsSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_work_details', { ...args(f), p_filter: filter, p_offset: page * 20 }))) }),
  editorial: (actor: string, f: Filters) => queryOptions({ queryKey: ['analytics', actor, 'editorial', f], staleTime: 60_000,
    queryFn: async () => editorialSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_editorial', args(f)))) }),
  reviews: (actor: string, f: Filters) => queryOptions({ queryKey: ['analytics', actor, 'reviews', f], staleTime: 60_000,
    queryFn: async () => reviewsSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_reviews', args(f)))) }),
  billing: (actor: string, f: Filters) => queryOptions({ queryKey: ['analytics', actor, 'billing', f], staleTime: 60_000,
    queryFn: async () => billingSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_billing', { ...args(f), p_currency: f.currency }))) }),
  billingDetails: (actor: string, f: Filters, page: number) => queryOptions({ queryKey: ['analytics', actor, 'billing-details', f, page], staleTime: 60_000,
    queryFn: async () => billingDetailsSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_billing_details', { ...args(f), p_currency: f.currency, p_offset: page * 20 }))) }),
  options: (actor: string, f: Filters, kind: string, search: string, page: number) => queryOptions({ queryKey: ['analytics', actor, 'options', kind, f.agency, f.organization, f.brand, search, page], staleTime: 60_000,
    queryFn: async () => optionsSchema.parse(unwrap(await getSupabaseClient().rpc('analytics_filter_options', {
      p_kind: kind, p_agency: f.agency, p_organization: kind === 'organization' ? undefined : f.organization,
      p_brand: kind === 'project' ? f.brand : undefined, p_search: search, p_limit: 20, p_offset: page * 20,
    }))) }),
  reports: (actor: string, project: string | undefined, page: number) => queryOptions({ queryKey: ['analytics', actor, 'reports', project, page], staleTime: 60_000,
    queryFn: async () => reportsSchema.parse(unwrap(await getSupabaseClient().rpc('list_project_reports', { p_project: project, p_offset: page * 20 }))) }),
  clientReport: (actor: string, id: string) => queryOptions({ queryKey: ['analytics', actor, 'client-report', id], staleTime: 60_000,
    queryFn: async () => clientReportSchema.parse(unwrap(await getSupabaseClient().rpc('client_project_report', { p_report: id }))) }),
}
export async function exportAnalytics(section: string, f: Filters) {
  return unwrap(await getSupabaseClient().rpc('export_analytics', { ...args(f), p_section: section, p_currency: f.currency }))
}
export async function createReport(project: string, title: string, f: Filters) {
  return unwrap(await getSupabaseClient().rpc('create_project_report', { p_project: project, p_title: title, p_from: f.from, p_to: f.to }))
}
export async function publishReport(id: string, publish: boolean) {
  return unwrap(await getSupabaseClient().rpc('set_project_report_publication', { p_report: id, p_publish: publish }))
}
