import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { getDeliverableDetail, getReviewConfiguration, listReviewQueue } from './review-service'

export const reviewKeys = {
  all: ['reviews'] as const,
  queueRoot: () => [...reviewKeys.all, 'queue'] as const,
  queue: (page = 0) => [...reviewKeys.queueRoot(), { status: 'pending', limit: 50, page }] as const,
  detail: (workItemId: string) => [...reviewKeys.all, 'deliverable', workItemId] as const,
  configuration: (projectId: string, deliverableId: string | null = null) =>
    [...reviewKeys.all, 'configuration', projectId, deliverableId ?? 'project'] as const,
}

export const reviewQueueQuery = (page = 0) => queryOptions({
  queryKey: reviewKeys.queue(page), queryFn: () => listReviewQueue(getSupabaseClient(), page),
})
export const deliverableDetailQuery = (workItemId: string) => queryOptions({
  queryKey: reviewKeys.detail(workItemId), queryFn: () => getDeliverableDetail(getSupabaseClient(), workItemId),
})
export const reviewConfigurationQuery = (projectId: string, deliverableId: string | null = null) => queryOptions({
  queryKey: reviewKeys.configuration(projectId, deliverableId),
  queryFn: () => getReviewConfiguration(getSupabaseClient(), projectId, deliverableId),
})
