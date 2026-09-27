import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { listEditorialFileTargets, listFileAssets, listFileProjects, listReadyProjectFiles, listVersionFiles, type FileFilters } from './file-service'

export const fileKeys = {
  all: ['files'] as const,
  list: (filters: FileFilters) => [...fileKeys.all, 'list', filters] as const,
  projects: () => [...fileKeys.all, 'projects'] as const,
  ready: (projectId: string, search: string, page: number) => [...fileKeys.all, 'ready', projectId, search, page] as const,
  version: (ids: string[]) => [...fileKeys.all, 'versions', ids] as const,
  editorial: (projectId: string, search: string) => [...fileKeys.all, 'editorial', projectId, search] as const,
}
export const filesQuery = (filters: FileFilters) => queryOptions({ queryKey: fileKeys.list(filters), queryFn: () => listFileAssets(getSupabaseClient(), filters) })
export const fileProjectsQuery = () => queryOptions({ queryKey: fileKeys.projects(), queryFn: () => listFileProjects(getSupabaseClient()) })
export const readyFilesQuery = (projectId: string, search = '', page = 0) => queryOptions({ queryKey: fileKeys.ready(projectId, search, page), queryFn: () => listReadyProjectFiles(getSupabaseClient(), projectId, search, page), enabled: Boolean(projectId) })
export const versionFilesQuery = (ids: string[]) => queryOptions({ queryKey: fileKeys.version(ids), queryFn: () => listVersionFiles(getSupabaseClient(), ids), enabled: ids.length > 0 })
export const editorialTargetsQuery = (projectId: string, search: string) => queryOptions({ queryKey: fileKeys.editorial(projectId, search), queryFn: () => listEditorialFileTargets(getSupabaseClient(), projectId, search), enabled: Boolean(projectId) })
