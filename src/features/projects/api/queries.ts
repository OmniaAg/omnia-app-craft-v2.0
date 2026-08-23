import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import {
  getProjectDetail,
  listProjectBrandOptions,
  listProjectMemberCandidates,
  listProjectMembers,
  listProjectMilestones,
  listProjects,
} from './project-service'

export const projectKeys = {
  all: ['projects'] as const,
  list: (filters: { page: number; search: string; status: string }) =>
    [...projectKeys.all, 'list', { scope: 'authorized', sort: 'created_desc', ...filters }] as const,
  brands: () => [...projectKeys.all, 'brand-options'] as const,
  detail: (projectId: string) => [...projectKeys.all, 'detail', projectId] as const,
  members: (projectId: string) => [...projectKeys.detail(projectId), 'members'] as const,
  candidates: (projectId: string) => [...projectKeys.detail(projectId), 'member-candidates'] as const,
  milestones: (projectId: string) => [...projectKeys.detail(projectId), 'milestones'] as const,
}

export const projectsQuery = (filters: { page: number; search: string; status: string }) =>
  queryOptions({ queryKey: projectKeys.list(filters), queryFn: () => listProjects(getSupabaseClient(), filters) })

export const projectBrandsQuery = () =>
  queryOptions({ queryKey: projectKeys.brands(), queryFn: () => listProjectBrandOptions(getSupabaseClient()), staleTime: 5 * 60_000 })

export const projectDetailQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.detail(projectId), queryFn: () => getProjectDetail(getSupabaseClient(), projectId) })

export const projectMembersQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.members(projectId), queryFn: () => listProjectMembers(getSupabaseClient(), projectId) })

export const projectCandidatesQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.candidates(projectId), queryFn: () => listProjectMemberCandidates(getSupabaseClient(), projectId) })

export const projectMilestonesQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.milestones(projectId), queryFn: () => listProjectMilestones(getSupabaseClient(), projectId) })
