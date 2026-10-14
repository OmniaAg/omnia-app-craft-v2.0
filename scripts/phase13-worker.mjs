import { readFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

const status = getLocalSupabaseStatus()
const envFile = process.argv.find(arg => arg.startsWith('--env-file='))?.split('=').slice(1).join('=') ?? 'supabase/.env.local'
const entries = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)]
}))
const token = process.env.AUTOMATION_WORKER_TOKEN ?? entries.AUTOMATION_WORKER_TOKEN
if (!token || token.length < 32) throw new Error('Worker token is missing')
const once = async () => {
  const response = await fetch(`${status.API_URL}/functions/v1/automation-api`, { method: 'POST',
    headers: { apikey: status.PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'dispatch' }), signal: AbortSignal.timeout(55_000) })
  const value = await response.json()
  if (!response.ok) throw new Error(`Worker rejected: HTTP ${response.status}`)
  console.log(JSON.stringify(value))
}
if (process.argv.includes('--watch')) {
  // Explicit invocation; bounded rate, no table-change polling and no cron infrastructure.
  for (;;) { await once(); await new Promise(resolve => setTimeout(resolve, 2000)) }
} else await once()
