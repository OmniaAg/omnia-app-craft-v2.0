import { execFileSync } from 'node:child_process'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus() // Refuse remote targets.
const container = 'supabase_kong_omnia-craft'
const path = '/home/kong/kong.yml'
const original = execFileSync('docker', ['exec', container, 'cat', path], { encoding: 'utf8' })
const sectionPattern = /(\n  - name: functions-v1\n[\s\S]*?)(?=\n  - name:|\nupstreams:|$)/
const section = original.match(sectionPattern)?.[1]
if (!section || !section.includes('      - name: cors')) throw new Error('Local Functions gateway structure changed; review the pinned CLI config')
if (!section.includes('# OMNIA local Functions CORS')) {
  // Keep the CLI's unrelated routes and all key material in memory, never logs/files.
  const modified = section.replace('      - name: cors', [
    '      - name: cors', '        # OMNIA local Functions CORS', '        config:',
    '          origins:', '            - http://localhost:53170', '            - http://127.0.0.1:53170',
    '          preflight_continue: true',
  ].join('\n'))
  const output = original.replace(sectionPattern, () => modified)
  execFileSync('docker', ['exec', '-u', '0', '-i', container, 'sh', '-c', 'cat > /home/kong/kong.yml'], { input: output, stdio: ['pipe', 'pipe', 'pipe'] })
  execFileSync('docker', ['exec', container, 'kong', 'reload'], { stdio: ['ignore', 'pipe', 'pipe'] })
}
console.log('Local Functions gateway uses exact OMNIA origins and passes preflight to the Function.')
