import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { setupTestCredentials } from './test-fixtures/credentials.mjs'

// Disposable credentials for the deterministic local Function tests only.
// Never changes the developer's existing supabase/.env.local.
mkdirSync('artifacts/phase-13', { recursive: true })
writeFileSync('supabase/.env.phase13-test.local', [
  'APP_URL=http://localhost:53170', 'AI_PROVIDER=local_deterministic',
  `INTEGRATION_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  `AUTOMATION_WORKER_TOKEN=${randomBytes(32).toString('hex')}`,
  'WEBHOOK_ALLOWED_ORIGINS=http://host.docker.internal:56413', 'PHASE13_ALLOW_LOCAL_HTTP=true', '',
].join('\n'))
await setupTestCredentials()
console.log('Disposable Phase 13 local environment prepared (values hidden).')
