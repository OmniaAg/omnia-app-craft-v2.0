import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
const output = resolve('artifacts/phase-13')
mkdirSync(output, { recursive: true })
const results = []
let sequence = 0
const prefix = process.argv.includes('--frontend') ? 'frontend-' : process.argv.includes('--final') ? 'final-' : ''
function run(name, program = process.execPath, args = [npm, 'run', name]) {
  const started = Date.now()
  try {
    const text = execFileSync(program, args, { encoding: 'utf8', timeout: 240_000, maxBuffer: 12 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    writeFileSync(resolve(output, `${prefix}${++sequence}-${name.replaceAll(':', '-')}.log`), text)
    results.push({ command: name, passed: true, seconds: (Date.now()-started)/1000 })
    console.log(`${name}: PASS (${results.at(-1).seconds.toFixed(1)}s)`)
    return true
  } catch (error) {
    writeFileSync(resolve(output, `${prefix}${++sequence}-${name.replaceAll(':', '-')}.log`), `${error.stdout ?? ''}\n${error.stderr ?? ''}`)
    results.push({ command: name, passed: false, seconds: (Date.now()-started)/1000 })
    console.log(`${name}: FAIL (see artifacts/phase-13)`)
    return false
  }
}
if (process.argv.includes('--frontend')) {
  for (const command of ['typecheck', 'lint', 'test', 'build']) run(command)
} else if (process.argv.includes('--final')) {
  if (run('db:reset')) { run('db:test'); run('db:lint'); run('db:types:check'); run('test:auth') }
  for (const suite of ['test:messaging', 'test:automations', 'test:integrations', 'test:ai']) { if (!run('db:reset')) break; run(suite) }
  for (const command of ['typecheck', 'lint', 'test', 'build']) run(command)
  const regressions = JSON.parse(readFileSync(resolve(output, 'regressions.json'), 'utf8'))
  const latest = regressions.filter(result => result.command !== 'db:reset').map(result => results.findLast(row => row.command === result.command) ?? result)
  writeFileSync(resolve(output, 'regressions-latest.json'), JSON.stringify(latest, null, 2))
} else if (process.argv.includes('--regressions')) {
  for (const suite of ['test:connectivity','test:auth','test:crm','test:work','test:dashboard','test:editorial','test:deliverables','test:files','test:portal','test:messaging','test:billing','test:analytics']) {
    if (!run('db:reset')) break
    run(suite)
  }
} else {
  if (run('db:reset')) {
    for (const command of ['db:test','db:lint','db:types','db:types:check']) run(command)
    run('advisors', process.execPath, ['node_modules/supabase/dist/supabase.js','db','advisors','--local','--type','all','--level','warn','--fail-on','error'])
  }
  for (const suite of ['test:automations','test:integrations','test:ai']) { if (!run('db:reset')) break; run(suite) }
  for (const command of ['typecheck','lint','test','build']) run(command)
}
writeFileSync(resolve(output, process.argv.includes('--frontend') ? 'frontend-final.json' : process.argv.includes('--regressions') ? 'regressions.json' : process.argv.includes('--final') ? 'final-verification.json' : 'verification.json'), JSON.stringify(results, null, 2))
if (results.some(result => !result.passed)) process.exitCode = 1
