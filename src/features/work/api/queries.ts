import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { listProjectWork, listWorkComments, listWorkEvents } from './work-service'

export const workKeys = {
  all: ['work'] as const,
  project: (projectId: string) => [...workKeys.all, 'project', projectId, { limit: 100, sort: 'state_priority_due' }] as const,
  item: (workItemId: string) => [...workKeys.all, 'item', workItemId] as const,
  comments: (workItemId: string) => [...workKeys.item(workItemId), 'comments', { limit: 50 }] as const,
  events: (workItemId: string) => [...workKeys.item(workItemId), 'events', { limit: 50 }] as const,
}

export const projectWorkQuery = (projectId: string) =>
  queryOptions({ queryKey: workKeys.project(projectId), queryFn: () => listProjectWork(getSupabaseClient(), projectId) })

export const workCommentsQuery = (workItemId: string) =>
  queryOptions({ queryKey: workKeys.comments(workItemId), queryFn: () => listWorkComments(getSupabaseClient(), workItemId) })

export const workEventsQuery = (workItemId: string) =>
  queryOptions({ queryKey: workKeys.events(workItemId), queryFn: () => listWorkEvents(getSupabaseClient(), workItemId) })
