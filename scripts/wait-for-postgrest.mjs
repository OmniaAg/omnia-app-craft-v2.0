import { waitForPostgrest } from './lib/local-supabase.mjs'

try {
  const { attempts } = await waitForPostgrest()
  console.log(`PostgREST is ready (${attempts} attempt${attempts === 1 ? '' : 's'}).`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

