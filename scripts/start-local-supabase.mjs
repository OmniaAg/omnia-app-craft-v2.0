import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalSupabaseStatus, waitForPostgrest } from './lib/local-supabase.mjs'

const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')

try {
  execFileSync(process.execPath, [cli, 'start'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const { attempts } = await waitForPostgrest(getLocalSupabaseStatus())
  console.log(`Supabase local stack is running for project omnia-craft; PostgREST ready in ${attempts} attempt${attempts === 1 ? '' : 's'}.`)
} catch (error) {
  const status = typeof error.status === 'number' ? error.status : 1
  console.error(`Supabase local start failed (exit ${status}).`)
  process.exitCode = status
}
