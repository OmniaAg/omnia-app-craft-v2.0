import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

const status = getLocalSupabaseStatus()
const env = readFileSync('supabase/.env.phase13-test.local', 'utf8')
const values = [status.SECRET_KEY, status.SERVICE_ROLE_KEY,
  ...['INTEGRATION_ENCRYPTION_KEY', 'AUTOMATION_WORKER_TOKEN'].map(name => env.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]),
  'phase13-local-test-signing-material-00000000000000',
].filter(Boolean)
let checked = 0
for (const folder of ['dist/assets', 'artifacts/phase-13']) {
  for (const file of readdirSync(folder).filter(name => /\.(js|css|json|log)$/.test(name))) {
    const contents = readFileSync(`${folder}/${file}`, 'utf8')
    assert.ok(values.every(value => !contents.includes(value)), `Server credential exposure in ${folder}/${file}`)
    checked++
  }
}
writeFileSync('artifacts/phase-13/secret-scan.json', JSON.stringify({ passed: true, filesChecked: checked, boundary: 'Production assets and Phase 13 evidence', secretsPrinted: false }, null, 2))
console.log(`PASS: ${checked} assets/evidence files contain no server credentials or signing fixture.`)
