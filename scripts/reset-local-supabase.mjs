import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalSupabaseStatus, waitForPostgrest } from './lib/local-supabase.mjs'

const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')

try {
  execFileSync(process.execPath, [cli, 'db', 'reset', '--local'], {
    encoding: 'utf8',
    stdio: 'inherit',
  })
  const { attempts } = await waitForPostgrest(getLocalSupabaseStatus())
  console.log(`Local database reset complete; PostgREST ready in ${attempts} attempt${attempts === 1 ? '' : 's'}.`)
} catch (error) {
  const status = typeof error?.status === 'number' ? error.status : 1
  if (!(error instanceof Error && error.message.includes('PostgREST'))) {
    console.error(`Supabase local reset failed (exit ${status}).`)
  } else {
    console.error(error.message)
  }
  process.exitCode = status
}

