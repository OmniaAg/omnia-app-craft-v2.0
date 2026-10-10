// Sequential mutation suites with isolated fixtures. Requires the local
// invite-user function server and Docker, as documented in README.
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus() // enforces the OMNIA loopback API and port
const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
const outputDir = resolve('artifacts/phase-12')
mkdirSync(outputDir, { recursive: true })
const suites = ['test:connectivity', 'test:auth', 'test:crm', 'test:work', 'test:dashboard', 'test:editorial',
  'test:deliverables', 'test:files', 'test:portal', 'test:messaging', 'test:billing']
const results = []
function run(command) {
  const started = Date.now()
  try {
    const output = execFileSync(process.execPath, [npm, 'run', command], { encoding: 'utf8', timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'] })
    writeFileSync(resolve(outputDir, `${command.replaceAll(':', '-')}.log`), output)
    console.log(`${command}: PASS (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    return true
  } catch (error) {
    writeFileSync(resolve(outputDir, `${command.replaceAll(':', '-')}.log`), `${error.stdout ?? ''}\n${error.stderr ?? ''}`)
    console.log(`${command}: FAIL (see artifacts/phase-12)`)
    return false
  }
}
for (const command of suites) {
  if (!run('db:reset')) { results.push({ command, passed: false, reason: 'reset failed' }); break }
  results.push({ command, passed: run(command) })
}
writeFileSync(resolve(outputDir, 'regressions.json'), JSON.stringify(results, null, 2))
if (results.length !== suites.length || results.some(result => !result.passed)) process.exitCode = 1
