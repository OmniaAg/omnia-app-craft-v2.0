import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

const fakeClient = vi.hoisted(() => ({
  removeAllChannels: vi.fn(async () => []),
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
}))

vi.mock('../shared/api/supabase/client', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('../shared/api/supabase/client')
  >()
  return {
    ...original,
    getSupabaseClient: () => fakeClient,
  }
})

import App from '../App'

it('restores an anonymous session and renders the login route', async () => {
  window.history.pushState({}, '', '/')
  render(<App />)

  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'Vuelve a tu espacio',
    }),
  ).toBeTruthy()
})
