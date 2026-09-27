import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { getPortalDeliverable, getPortalProject, listPortalApprovals,
  listPortalDeliverables, listPortalDocuments, listPortalNotifications, listPortalProjects } from './portal-service'

export const portalKeys = {
  all: ['portal'] as const,
  projects: (page: number) => ['portal', 'projects', page] as const,
  project: (id: string) => ['portal', 'project', id] as const,
  deliverables: (projectId: string | undefined, page: number) => ['portal', 'deliverables', projectId ?? 'all', page] as const,
  deliverable: (id: string) => ['portal', 'deliverable', id] as const,
  approvals: (page: number) => ['portal', 'approvals', page] as const,
  documents: (projectId: string | undefined, page: number) => ['portal', 'documents', projectId ?? 'all', page] as const,
  notifications: (page: number) => ['portal', 'notifications', page] as const,
}
export const portalQueries = {
  projects: (page: number) => queryOptions({ queryKey: portalKeys.projects(page), queryFn: () => listPortalProjects(getSupabaseClient(), page) }),
  project: (id: string) => queryOptions({ queryKey: portalKeys.project(id), queryFn: () => getPortalProject(getSupabaseClient(), id) }),
  deliverables: (projectId: string | undefined, page: number) => queryOptions({ queryKey: portalKeys.deliverables(projectId, page), queryFn: () => listPortalDeliverables(getSupabaseClient(), page, projectId) }),
  deliverable: (id: string) => queryOptions({ queryKey: portalKeys.deliverable(id), queryFn: () => getPortalDeliverable(getSupabaseClient(), id) }),
  approvals: (page: number) => queryOptions({ queryKey: portalKeys.approvals(page), queryFn: () => listPortalApprovals(getSupabaseClient(), page) }),
  documents: (projectId: string | undefined, page: number) => queryOptions({ queryKey: portalKeys.documents(projectId, page), queryFn: () => listPortalDocuments(getSupabaseClient(), page, projectId) }),
  notifications: (page: number) => queryOptions({ queryKey: portalKeys.notifications(page), queryFn: () => listPortalNotifications(getSupabaseClient(), page) }),
}
