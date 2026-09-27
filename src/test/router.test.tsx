import { fireEvent, render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../app/router/routes'
import {
  AuthContext,
  type AuthContextValue,
} from '../features/auth/context/AuthContext'
import type {
  AgencyMembership,
  AuthenticatedActor,
  ClientMembership,
} from '../features/auth/model/authorization'

vi.mock('../features/messaging/ui/NotificationBadge', () => ({ NotificationBadge: () => null }))

function authValue(context: 'anonymous' | 'agency' | 'client'): AuthContextValue {
  const agencyMemberships = context === 'agency'
    ? [{ status: 'active' } as AgencyMembership]
    : []
  const clientMemberships = context === 'client'
    ? [{ status: 'active' } as ClientMembership]
    : []
  const actor = context === 'anonymous'
    ? null
    : ({
        user: { id: 'user-id', email: `${context}@omnia.local` } as User,
        profile: null,
        agencyMemberships,
        clientMemberships,
        capabilities: [],
      } satisfies AuthenticatedActor)

  return {
    status: context === 'anonymous' ? 'anonymous' : 'authenticated',
    session: null,
    actor,
    error: null,
    hasAgencyContext: context === 'agency',
    hasClientContext: context === 'client',
    signIn: vi.fn(async () => '/app'),
    signOut: vi.fn(async () => undefined),
    sendRecovery: vi.fn(async () => undefined),
    savePassword: vi.fn(async () => '/app'),
    acceptInvite: vi.fn(async () => '/app'),
    refreshAuthorization: vi.fn(async () => actor),
    hasCapability: vi.fn(() => false),
  }
}

function renderRoute(path: string, context: 'anonymous' | 'agency' | 'client') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['dashboard', 'config', 'main'], null)
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue(context)}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('application routes', () => {
  it('resolves the internal shell only with agency context', async () => {
    renderRoute('/app', 'agency')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Tu dashboard',
      }),
    ).toBeTruthy()
  })

  it('resolves the portal shell only with client context', async () => {
    renderRoute('/portal', 'client')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Tu espacio con OMNIA',
      }),
    ).toBeTruthy()
  })

  it('redirects an anonymous protected route to login', async () => {
    renderRoute('/app', 'anonymous')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Vuelve a tu espacio',
      }),
    ).toBeTruthy()
  })

  it('keeps recovery and invitation surfaces public', async () => {
    renderRoute('/forgot-password', 'anonymous')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Recupera tu acceso',
      }),
    ).toBeTruthy()
  })

  it('lets the user reveal and conceal the login password', async () => {
    renderRoute('/login', 'anonymous')
    const password = await screen.findByLabelText('Contraseña')

    expect(password.getAttribute('type')).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(password.getAttribute('type')).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(password.getAttribute('type')).toBe('password')
  })

  it('renders the not-found fallback for an unknown route', async () => {
    renderRoute('/missing-route', 'anonymous')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Esta ruta no existe',
      }),
    ).toBeTruthy()
  })
})
