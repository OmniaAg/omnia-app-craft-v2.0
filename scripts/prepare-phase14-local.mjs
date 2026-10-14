import { createECDH, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { setupTestCredentials } from './test-fixtures/credentials.mjs'
// Disposable local-only material. This file is ignored; values are never printed.
const pair=createECDH('prime256v1'); pair.generateKeys()
const previous=readFileSync('supabase/.env.phase13-test.local','utf8')
writeFileSync('supabase/.env.phase14-test.local',`${previous}\nVAPID_PUBLIC_KEY=${pair.getPublicKey().toString('base64url')}\nVAPID_PRIVATE_KEY=${pair.getPrivateKey().toString('base64url')}\nVAPID_SUBJECT=mailto:phase14-local-test@example.invalid\nPUSH_WORKER_TOKEN=${randomBytes(32).toString('hex')}\nPUSH_SENDER=local_deterministic\nPHASE14_LOCAL_TEST_ONLY=true\n`)
await setupTestCredentials()
console.log('Disposable Phase 14 + Phase 13 local test environment prepared; secrets hidden.')
