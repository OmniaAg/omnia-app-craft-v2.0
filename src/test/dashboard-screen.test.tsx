import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardApiError } from '../features/dashboard/api/dashboard-service'
import { dashboardKeys } from '../features/dashboard/api/queries'
import { AuthContext, type AuthContextValue } from '../features/auth/context/AuthContext'
import type { AuthenticatedActor } from '../features/auth/model/authorization'
import { Component as DashboardScreen } from '../features/dashboard/screens/DashboardScreen'
import type { DashboardDocument } from '../features/dashboard/model/dashboard'

const serviceMocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('../features/dashboard/api/dashboard-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/dashboard/api/dashboard-service')>()
  return { ...actual, loadDashboardConfig: serviceMocks.load, saveDashboardConfig: serviceMocks.save, resetDashboardConfig: serviceMocks.reset }
})

class ResizeObserverStub {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) { this.callback = callback }
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 1080 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}

function storedRow(document: DashboardDocument) {
  return {
    user_id: '10000000-0000-0000-0000-000000000004', dashboard_key: 'main', registry_version: 1,
    widget_instances: document.instances, responsive_layouts: document.layouts, revision: document.revision + 1,
    created_at: '2026-08-22T00:00:00Z', updated_at: '2026-08-22T00:00:00Z',
  }
}

function renderDashboard({ seed = true }: { seed?: boolean } = {}) {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  const actor = {
    user: { id: '10000000-0000-0000-0000-000000000004' } as User,
    profile: null, agencyMemberships: [], clientMemberships: [], capabilities: [],
  } satisfies AuthenticatedActor
  const auth = {
    status: 'authenticated', session: null, actor, error: null,
    hasAgencyContext: true, hasClientContext: false,
    signIn: vi.fn(), signOut: vi.fn(), sendRecovery: vi.fn(), savePassword: vi.fn(), acceptInvite: vi.fn(), refreshAuthorization: vi.fn(),
    hasCapability: vi.fn(() => false),
  } as unknown as AuthContextValue
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(dashboardKeys.operational(), {
    work: { counts: { total: 0, overdue: 0, today: 0, upcoming: 0, noDueDate: 0 }, nextItems: [], overdueItems: [], todayItems: [], upcomingItems: [] },
    projects: { activeCount: 0, attentionCount: 0, items: [] },
  })
  if (seed) client.setQueryData(dashboardKeys.config(), null)
  render(<MemoryRouter><QueryClientProvider client={client}><AuthContext.Provider value={auth}><DashboardScreen /></AuthContext.Provider></QueryClientProvider></MemoryRouter>)
  return client
}

describe('Phase 5 dashboard screen', () => {
  beforeEach(() => {
    serviceMocks.load.mockReset().mockResolvedValue(null)
    serviceMocks.save.mockReset().mockImplementation(async (_client, document: DashboardDocument) => storedRow(document))
    serviceMocks.reset.mockReset().mockResolvedValue(true)
  })

  it('opens an accessible edit toolbox without exposing CRM to a contributor', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: 'Tu dashboard' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Biblioteca de widgets' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Oportunidades/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Organizaciones/ })).toBeNull()
  })

  it('removes and adds a widget through the edit menu', async () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(await screen.findByLabelText('Opciones de Mi trabajo'))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Mi trabajo' }))
    await waitFor(() => expect(serviceMocks.save).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: '+ Mi trabajo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Mi trabajo' }))
    await waitFor(() => expect(serviceMocks.save).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Mi trabajo' })).toBeTruthy()
  })

  it('resets the persisted override from edit mode', async () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    await waitFor(() => expect(serviceMocks.reset).toHaveBeenCalledWith(expect.anything(), 0))
    expect(screen.getByText('Dashboard restablecido.')).toBeTruthy()
  })

  it('preserves the draft and offers server reload on a CAS conflict', async () => {
    serviceMocks.save.mockRejectedValueOnce(new DashboardApiError('Tu dashboard cambió en otra sesión.', '40001'))
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(await screen.findByLabelText('Opciones de Mi trabajo'))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Mi trabajo' }))
    expect((await screen.findByRole('alert')).textContent).toContain('versión más reciente')
    expect(screen.getByRole('button', { name: 'Cargar versión del servidor' })).toBeTruthy()
  })

  it('renders complete loading and load-error states', async () => {
    serviceMocks.load.mockReturnValueOnce(new Promise(() => undefined))
    renderDashboard({ seed: false })
    expect(screen.getByRole('status').textContent).toContain('Cargando tu dashboard')
  })

  it('renders a retry action when configuration loading fails', async () => {
    serviceMocks.load.mockRejectedValueOnce(new Error('offline'))
    renderDashboard({ seed: false })
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar tu configuración')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
})
