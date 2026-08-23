import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')

try {
  const status = JSON.parse(
    execFileSync(process.execPath, [cli, 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )

  console.log(
    JSON.stringify(
      {
        projectId: 'omnia-craft',
        apiUrl: status.API_URL,
        functionsUrl: status.FUNCTIONS_URL,
        studioUrl: status.STUDIO_URL,
        mailpitUrl: status.MAILPIT_URL,
        publishableKey: status.PUBLISHABLE_KEY,
      },
      null,
      2,
    ),
  )
} catch (error) {
  const status = typeof error.status === 'number' ? error.status : 1
  console.error(`Supabase local status failed (exit ${status}).`)
  process.exitCode = status
}
