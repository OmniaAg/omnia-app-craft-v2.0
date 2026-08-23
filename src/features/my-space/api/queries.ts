import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { listMySpaceItems } from './my-space-service'

export const mySpaceKeys = {
  all: ['my-space'] as const,
  items: () => [...mySpaceKeys.all, 'items', { timezone: 'America/Mexico_City' }] as const,
}

export const mySpaceQuery = () =>
  queryOptions({ queryKey: mySpaceKeys.items(), queryFn: () => listMySpaceItems(getSupabaseClient()) })
