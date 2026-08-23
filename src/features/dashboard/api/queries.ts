import { queryOptions } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { loadCrmSummary, loadDashboardConfig, loadOperationalSummary } from './dashboard-service'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  config: () => ['dashboard', 'config', 'main'] as const,
  operational: () => ['dashboard', 'summary', 'operational'] as const,
  crm: () => ['dashboard', 'summary', 'crm'] as const,
}

export const dashboardConfigQuery = () => queryOptions({
  queryKey: dashboardKeys.config(), queryFn: () => loadDashboardConfig(getSupabaseClient()), staleTime: 60_000,
})
export const operationalSummaryQuery = () => queryOptions({
  queryKey: dashboardKeys.operational(), queryFn: () => loadOperationalSummary(getSupabaseClient()), staleTime: 30_000,
})
export const crmSummaryQuery = () => queryOptions({
  queryKey: dashboardKeys.crm(), queryFn: () => loadCrmSummary(getSupabaseClient()), staleTime: 30_000,
})
