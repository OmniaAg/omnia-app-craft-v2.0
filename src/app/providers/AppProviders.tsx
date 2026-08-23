import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AuthProvider } from '../../features/auth/context/AuthProvider'
import { AppErrorBoundary } from './AppErrorBoundary'

type AppProvidersProps = {
  children: ReactNode
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient)

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
