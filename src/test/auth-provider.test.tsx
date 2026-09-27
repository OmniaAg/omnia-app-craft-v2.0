import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { OmniaSupabaseClient } from '../shared/api/supabase/client'
import { useAuth } from '../features/auth/context/AuthContext'
import { AuthProvider } from '../features/auth/context/AuthProvider'

const user = {
  id: '10000000-0000-0000-0000-000000000001',
  email: 'director@omnia.local',
} as User

const session = {
  access_token: 'verified-access-token',
  refresh_token: 'verified-refresh-token',
  expires_in: 3600,
  expires_at: 9999999999,
  token_type: 'bearer',
  user,
} as Session

function createSessionClient() {
  const unsubscribe = vi.fn()
  const client = {
    removeAllChannels: vi.fn(async () => []),
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  user_id: user.id,
                  display_name: 'Directora',
                  timezone: 'America/Mexico_City',
                  created_at: '2026-08-22T00:00:00Z',
                  updated_at: '2026-08-22T00:00:00Z',
                },
                error: null,
              }),
            }),
          }),
        }
      }

      const data = table === 'agency_memberships'
        ? [{ user_id: user.id, status: 'active', agency_id: 'agency-id' }]
        : []

      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({ data, error: null }),
          }),
        }),
      }
    }),
    rpc: vi.fn(async () => ({
      data: [
        {
          capability_key: 'agency.member.invite',
          scope_kind: 'agency',
          scope_id: 'agency-id',
        },
      ],
      error: null,
    })),
  }

  return {
    client: client as unknown as OmniaSupabaseClient,
    unsubscribe,
  }
}

function AuthProbe() {
  const auth = useAuth()
  return (
    <div>
      <span>{auth.status}</span>
      <span>{auth.actor?.user.email}</span>
      <span>{auth.hasAgencyContext ? 'agency' : 'no-agency'}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  it('restores a verified session and its authorization projection', async () => {
    const { client } = createSessionClient()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider client={client}><AuthProbe /></AuthProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeTruthy()
    })
    expect(screen.getByText('director@omnia.local')).toBeTruthy()
    expect(screen.getByText('agency')).toBeTruthy()
  })

  it('unsubscribes the auth listener when the provider unmounts', () => {
    const { client, unsubscribe } = createSessionClient()
    const queryClient = new QueryClient()
    const view = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider client={client}><AuthProbe /></AuthProvider>
      </QueryClientProvider>,
    )

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('clears cached portal data when the session ends', async () => {
    const { client } = createSessionClient()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider client={client}><AuthProbe /></AuthProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy())
    queryClient.setQueryData(['portal', 'projects', 0], [{ id: 'private-project' }])
    const listener = vi.mocked(client.auth.onAuthStateChange).mock.calls[0]?.[0]
    expect(listener).toBeDefined()
    listener?.('SIGNED_OUT', null)
    await waitFor(() => expect(screen.getByText('anonymous')).toBeTruthy())
    expect(queryClient.getQueryData(['portal', 'projects', 0])).toBeUndefined()
  })
})
