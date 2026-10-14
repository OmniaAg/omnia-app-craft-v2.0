import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

// Serve automation-api with this deliberately incomplete, ignored environment.
if (process.argv.includes('--prepare')) {
  writeFileSync('supabase/.env.phase13-missing.local', 'APP_URL=http://localhost:53170\nAI_PROVIDER=unconfigured\nWEBHOOK_ALLOWED_ORIGINS=http://host.docker.internal:56413\nPHASE13_ALLOW_LOCAL_HTTP=true\n')
  console.log('Prepared ignored missing-configuration fixture; no credentials written.')
} else {
  const { status } = await waitForPostgrest()
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const login = await client.auth.signInWithPassword({ email: TEST_USERS.director[1], password: TEST_PASSWORD })
  assert.equal(login.error, null)
  const project = '60000000-0000-0000-0000-0000000000a1'
  const history = async () => {
    const result = await client.rpc('phase13_history', { p_project: project, p_kind: 'connections' })
    assert.equal(result.error, null)
    return result.data.total
  }
  const before = await history()
  const checks = []
  async function call(label, body, expected, authorized = true) {
    const response = await fetch(`${status.API_URL}/functions/v1/automation-api`, { method: 'POST', headers: {
      apikey: status.PUBLISHABLE_KEY, 'content-type': 'application/json',
      ...(authorized ? { Authorization: `Bearer ${login.data.session.access_token}` } : {}),
    }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
    const result = await response.json()
    assert.equal(response.status, expected)
    assert.deepEqual(Object.keys(result), ['error'])
    assert.equal(result.error, expected === 503 ? 'configuration_missing' : expected === 401 ? 'unauthorized' : 'invalid_payload')
    checks.push(label)
    console.log(`PASS ${label}`)
  }
  try {
    const ai = { operation: 'generateAI', projectId: project, task: 'project_summary', input: '', key: randomUUID(), consent: true }
    await call('Missing AI provider fails closed with safe 503', ai, 503)
    await call('Missing encryption key fails before metadata mutation', { operation: 'configureIntegration', projectId: project,
      name: 'Must not persist', key: randomUUID(), endpoint: 'http://host.docker.internal:56413/hook',
      secret: 'phase13-local-test-signing-material-00000000000000', consent: true }, 503)
    await call('Missing worker token fails closed with safe 503', { operation: 'dispatch' }, 503)
    await call('Unauthenticated request remains rejected', ai, 401, false)
    await call('Invalid payload remains rejected', { operation: 'generateAI', model: 'forged' }, 400)
    assert.equal(await history(), before)
    checks.push('Configuration failure created no connection')
    mkdirSync('artifacts/phase-13', { recursive: true })
    writeFileSync('artifacts/phase-13/edge-missing-config.json', JSON.stringify({ passed: checks.length, checks }, null, 2))
  } finally { await client.auth.signOut() }
}
