import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Lazy route transforms can exceed Testing Library's 1s default on the shared
// Windows/Docker host. Browser load budgets are measured on production builds.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
