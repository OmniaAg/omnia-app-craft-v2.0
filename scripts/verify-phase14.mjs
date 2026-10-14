import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
getLocalSupabaseStatus()
const npm=process.env.npm_execpath ?? resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const output=resolve('artifacts/phase-14'); mkdirSync(output,{recursive:true})
const results=[]
function run(name,program=process.execPath,args=[npm,'run',name]) {
  const start=Date.now(); let text='',passed=false
  try { text=execFileSync(program,args,{encoding:'utf8',timeout:300_000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}); passed=true }
  catch (error) { text=`${error.stdout ?? ''}\n${error.stderr ?? ''}` }
  const label=name.replaceAll(':','-')
  writeFileSync(resolve(output,`${label}.log`),text)
  results.push({command:name,passed,seconds:(Date.now()-start)/1000})
  writeFileSync(resolve(output,process.argv.includes('--regressions') ? 'regressions.json':process.argv.includes('--frontend') ? 'frontend-final.json':'verification.json'),JSON.stringify(results,null,2))
  console.log(`${name}: ${passed ? 'PASS':'FAIL'} (${results.at(-1).seconds.toFixed(1)}s)`)
  return passed
}
if (process.argv.includes('--frontend')) {
  for (const command of ['typecheck','lint','test','build','test:pwa']) run(command)
  run('bundle',process.execPath,['scripts/phase14-bundle.mjs'])
  run('secret-scan',process.execPath,['scripts/check-phase14-secrets.mjs'])
} else if (process.argv.includes('--retry-failed')) {
  const previous=JSON.parse(readFileSync(resolve(output,'regressions.json'),'utf8'))
  const suites=[...new Set(previous.filter(row => !row.passed && /^test:(connectivity|auth|crm|work|dashboard|editorial|deliverables|files|portal|messaging|billing|analytics|automations|integrations|ai)$/.test(row.command)).map(row => row.command))]
  for (const suite of suites) { if (!run('db:reset')) break; run(suite) }
  const latest=previous.map(row => {
    const retry=results.findLast(result => result.command===row.command)
    return !row.passed && retry ? {...retry,previousAttempt:row} : row
  })
  writeFileSync(resolve(output,'regressions.json'),JSON.stringify(latest,null,2))
} else if (process.argv.includes('--regressions')) {
  for (const suite of ['test:connectivity','test:auth','test:crm','test:work','test:dashboard','test:editorial','test:deliverables','test:files','test:portal','test:messaging','test:billing','test:analytics','test:automations','test:integrations','test:ai']) {
    if (!run('db:reset')) break
    run(suite)
  }
  run('db:reset')
} else {
  if (run('db:start') && run('db:reset')) {
    for (const command of ['db:test','db:lint','db:types','db:types:check']) run(command)
    run('advisors',process.execPath,['node_modules/supabase/dist/supabase.js','db','advisors','--local','--type','all','--level','warn','--fail-on','error'])
    run('test:push')
  }
  for (const command of ['typecheck','lint','test','build','test:pwa']) run(command)
  run('bundle',process.execPath,['scripts/phase14-bundle.mjs'])
  run('secret-scan',process.execPath,['scripts/check-phase14-secrets.mjs'])
}
if (results.some(result => !result.passed)) process.exitCode=1
