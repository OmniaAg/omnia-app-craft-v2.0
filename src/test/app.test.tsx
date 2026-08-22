import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from '../App'

it('renders the application foundation from the root route', async () => {
  window.history.pushState({}, '', '/')

  render(<App />)

  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'Espacio interno de OMNIA',
    }),
  ).toBeTruthy()
})
