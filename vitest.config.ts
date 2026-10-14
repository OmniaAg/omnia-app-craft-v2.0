import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Bound jsdom processes on the shared Windows/Docker QA workstation.
    maxWorkers: 4,
  },
})
