import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AuthProvider } from '../../features/auth/context/AuthProvider'
import { AppErrorBoundary } from './AppErrorBoundary'
import { assertOnline } from '../../features/pwa/connectivity'
import { PwaStatus } from '../../features/pwa/PwaStatus'

type AppProvidersProps = {
  children: ReactNode
}

function createQueryClient() {
  const queryClient = new QueryClient({
    mutationCache: new MutationCache({
      onMutate: () => assertOnline(),
      onSuccess: () => {
        // Mark operational reports stale after commands; refresh is manual or
        // on the next visit. Analytics does not subscribe to Realtime.
        void queryClient.invalidateQueries({ queryKey: ['analytics'], refetchType: 'none' })
      },
    }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        retry: 0,
        networkMode: 'always',
      },
    },
  })
  return queryClient
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient)

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><PwaStatus />{children}</AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
