import { spawnSync } from 'node:child_process'
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const dir='artifacts/ux-refactor/verification';mkdirSync(dir,{recursive:true})
const suites=['test-auth-integration.mjs','test-crm-integration.mjs','test-dashboard-integration.mjs','test-editorial-integration.mjs','test-files-integration.mjs','test-messaging-integration.mjs','test-billing-integration.mjs','test-phase13-integration.mjs automations','test-phase13-integration.mjs integrations','test-phase13-integration.mjs ai','test-pwa-integration.mjs','test-push-integration.mjs','test-concurrency-phase15.mjs','ux-fixture-regressions.mjs']
const results=[]
for(const suite of suites) {
  const [file,...args]=suite.split(' ')
  assert.ok(!/['"]db:reset['"]/.test(readFileSync(`scripts/${file}`,'utf8')),'Aggregate suites that reset the source database must not run here')
  const run=spawnSync(process.execPath,[`scripts/${file}`,...args],{env:{...process.env,OMNIA_QA_FRESH_PROJECT:'1'},encoding:'utf8',timeout:180000,maxBuffer:12*1024*1024})
  const log=(run.stdout??'')+(run.stderr??'')
  const name=suite.replaceAll(' ','-').replace('.mjs','')
  writeFileSync(`${dir}/${name}.log`,log)
  results.push({suite,exit:run.status,pass:run.status===0})
  writeFileSync(`${dir}/regressions.json`,JSON.stringify(results,null,2))
  console.log(`${run.status===0?'PASS':'FAIL'} ${suite}`)
}
assert.ok(results.every(result=>result.pass),'Every regression suite must pass')
