import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { applications, calendar, cycles, projectOptions, templates } from './editorial-service'

export const editorialKeys = {
  all: ['editorial'] as const,
  projects: () => [...editorialKeys.all, 'projects'] as const,
  templates: (projectId: string) => [...editorialKeys.all, 'templates', projectId] as const,
  cycles: (projectId: string) => [...editorialKeys.all, 'cycles', projectId] as const,
  window: (input: { from: string; to: string; projectId?: string; state?: string; channel?: string }) => [...editorialKeys.all, 'window', input] as const,
  applications: (itemId: string) => [...editorialKeys.all, 'applications', itemId] as const,
}
export const editorialProjectsQuery = () => queryOptions({ queryKey: editorialKeys.projects(), queryFn: () => projectOptions(getSupabaseClient()) })
export const editorialTemplatesQuery = (projectId: string) => queryOptions({ queryKey: editorialKeys.templates(projectId), queryFn: () => templates(getSupabaseClient(), projectId) })
export const editorialCyclesQuery = (projectId: string) => queryOptions({ queryKey: editorialKeys.cycles(projectId), queryFn: () => cycles(getSupabaseClient(), projectId) })
export const editorialWindowQuery = (input: { from: string; to: string; projectId?: string; state?: string; channel?: string }) => queryOptions({ queryKey: editorialKeys.window(input), queryFn: () => calendar(getSupabaseClient(), input) })
export const editorialApplicationsQuery = (itemId: string) => queryOptions({ queryKey: editorialKeys.applications(itemId), queryFn: () => applications(getSupabaseClient(), itemId) })
