import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['./src/test/supabase-connectivity.integration.ts'],
    restoreMocks: true,
  },
})
