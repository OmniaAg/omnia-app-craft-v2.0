import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { appRoutes } from '../app/router/routes'

const routeCases = [
  ['/app', 'Espacio interno de OMNIA'],
  ['/portal', 'Un espacio separado para clientes'],
  ['/login', 'Acceso todavía no implementado'],
  ['/forbidden', 'Acceso no disponible'],
] as const

describe('application routes', () => {
  it.each(routeCases)('resolves %s through its lazy route', async (path, heading) => {
    const router = createMemoryRouter(appRoutes, { initialEntries: [path] })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: heading }),
    ).toBeTruthy()
  })

  it('renders the not-found fallback for an unknown route', async () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/missing-route'],
    })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Esta ruta no existe',
      }),
    ).toBeTruthy()
  })
})
