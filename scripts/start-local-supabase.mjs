import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')

try {
  execFileSync(process.execPath, [cli, 'start'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log('Supabase local stack is running for project omnia-craft.')
} catch (error) {
  const status = typeof error.status === 'number' ? error.status : 1
  console.error(`Supabase local start failed (exit ${status}).`)
  process.exitCode = status
}
