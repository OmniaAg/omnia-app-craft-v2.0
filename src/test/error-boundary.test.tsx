import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../app/providers/AppErrorBoundary'

function BrokenComponent(): never {
  throw new Error('expected render failure')
}

it('renders the principal fallback when a descendant fails', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)

  render(
    <AppErrorBoundary>
      <BrokenComponent />
    </AppErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toBeTruthy()
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'OMNIA Craft encontró un problema',
    }),
  ).toBeTruthy()
})
