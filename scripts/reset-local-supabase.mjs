import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { getLocalSupabaseStatus, waitForPostgrest } from './lib/local-supabase.mjs'

const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')

try {
  try {
    execFileSync(process.execPath, [cli, 'db', 'reset', '--local'], {
      encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'],
    })
  } catch (error) {
    // CLI 2.115.0 can query Storage before Kong's restart is ready on Windows.
    // Recover only that exact post-reset failure, then verify migration history,
    // seed identity, and authenticated private Storage readiness. SQL failures fail.
    if (!String(error.stderr ?? '').includes('LegacyStorageGatewayNetworkError')) {
      console.error(String(error.stderr ?? 'Local reset failed'))
      throw error
    }
    console.log('CLI Storage restart race detected; verifying the completed local reset…')
    const expected = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).map(name => name.split('_')[0])
    const actual = execFileSync('docker', ['exec', 'supabase_db_omnia-craft', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c',
      'select version from supabase_migrations.schema_migrations order by version'], { encoding: 'utf8' }).trim().split(/\r?\n/)
    if (expected.sort().join(',') !== actual.sort().join(',')) throw new Error('Reset recovery: migration history differs')
    const seed = execFileSync('docker', ['exec', 'supabase_db_omnia-craft', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c',
      "select exists(select 1 from public.agency_memberships where user_id='10000000-0000-0000-0000-000000000001' and status='active')"], { encoding: 'utf8' }).trim()
    if (seed !== 't') throw new Error('Reset recovery: seed was not completed')
    await waitForPostgrest(getLocalSupabaseStatus(), { timeoutMs: 30_000 })
    const status = getLocalSupabaseStatus()
    const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
    const deadline = Date.now() + 20_000
    let ready = false
    while (Date.now() < deadline) {
      const { data, error: storageError } = await admin.storage.listBuckets()
      if (!storageError && data?.some(bucket => bucket.id === 'project-files' && !bucket.public)) { ready = true; break }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 500))
    }
    if (!ready) throw new Error('Reset recovery: private Storage is unavailable')
    console.log('Reset recovery verified migration history, seed and private Storage.')
  }
  const { attempts } = await waitForPostgrest(getLocalSupabaseStatus())
  await import('./configure-local-functions-cors.mjs')
  console.log(`Local database reset complete; PostgREST ready in ${attempts} attempt${attempts === 1 ? '' : 's'}.`)
  
  const { setupTestCredentials } = await import('./test-fixtures/credentials.mjs')
  await setupTestCredentials()
} catch (error) {
  const status = typeof error?.status === 'number' ? error.status : 1
  if (!(error instanceof Error && error.message.includes('PostgREST'))) {
    console.error(`Supabase local reset failed (exit ${status}).`)
  } else {
    console.error(error.message)
  }
  process.exitCode = status
}

