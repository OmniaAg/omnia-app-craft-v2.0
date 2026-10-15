import assert from 'node:assert/strict'
import { execFileSync,spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { getLocalSupabaseStatus,waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'

const {status}=await waitForPostgrest(getLocalSupabaseStatus())
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input,encoding:'utf8'}).trim()
const results=[]
function run(file,env={}) {
  const result=spawnSync(process.execPath,[`scripts/${file}`],{env:{...process.env,...env},encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024})
  writeFileSync(`artifacts/ux-refactor/verification/prepared-${file}.log`,(result.stdout??'')+(result.stderr??''))
  results.push({suite:file,pass:result.status===0})
  console.log(`${result.status===0?'PASS':'FAIL'} prepared ${file}`)
}
function fixture(filter,prepare,callback) {
  const original=JSON.parse(sql(`select coalesce(json_agg(row),'[]') from public.project_memberships row where ${filter}`))
  try {sql(prepare);callback()}
  finally {
    const json=JSON.stringify(original).replaceAll("'","''")
    sql(`delete from public.project_memberships where ${filter};insert into public.project_memberships select * from json_populate_recordset(null::public.project_memberships,'${json}'::json)`)
    const restored=JSON.parse(sql(`select coalesce(json_agg(row order by row.id),'[]') from public.project_memberships row where ${filter}`))
    assert.deepEqual(restored,original.toSorted((a,b)=>a.id.localeCompare(b.id)),'Original fixture memberships must be restored exactly')
  }
}
const project='60000000-0000-0000-0000-0000000000a1'
const clients=`user_id in ('${TEST_USERS.adminA[0]}','${TEST_USERS.viewerA[0]}')`
fixture(clients,`delete from public.project_memberships where ${clients} and (user_id='${TEST_USERS.viewerA[0]}' or project_id<>'${project}')`,()=>run('test-work-integration.mjs'))

const pm=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false}})
assert.equal((await pm.auth.signInWithPassword({email:TEST_USERS.pm[1],password:TEST_PASSWORD})).error,null)
const created=await pm.rpc('create_work_item',{project_id:project,title:`UX isolated deliverable fixture ${Date.now()}`,description:'Dedicated repeatable QA fixture',priority:'normal',due_local:null,milestone_id:null,assignee_ids:[TEST_USERS.contributor[0]],idempotency_key:crypto.randomUUID()})
assert.equal(created.error,null)
run('test-deliverables-integration.mjs',{OMNIA_QA_WORK_ITEM:created.data})

const pmFilter=`user_id='${TEST_USERS.pm[0]}' and project_id not in ('${project}','60000000-0000-0000-0000-0000000000a2','60000000-0000-0000-0000-0000000012a1')`
fixture(pmFilter,`delete from public.project_memberships where ${pmFilter}`,()=>run('test-analytics-integration.mjs'))
const reviewer=`project_id='${project}' and user_id='${TEST_USERS.reviewerA[0]}'`
fixture(reviewer,`delete from public.project_memberships where ${reviewer}`,()=>run('test-portal-integration.mjs'))
const financialFilter=`user_id='${TEST_USERS.pm[0]}' and capability_key like 'billing.%'`
const financialGrants=JSON.parse(sql(`select coalesce(json_agg(row order by row.id),'[]') from public.capability_grants row where ${financialFilter}`))
try {
  sql(`update public.capability_grants set revoked_at=now() where ${financialFilter}`)
  run('test-security-integration.mjs')
}finally {
  const json=JSON.stringify(financialGrants).replaceAll("'","''")
  sql(`update public.capability_grants g set revoked_at=original.revoked_at from json_populate_recordset(null::public.capability_grants,'${json}'::json) original where g.id=original.id`)
  const restored=JSON.parse(sql(`select coalesce(json_agg(row order by row.id),'[]') from public.capability_grants row where ${financialFilter}`))
  assert.deepEqual(restored,financialGrants,'Explicit PM Billing grants must be restored exactly')
}
writeFileSync('artifacts/ux-refactor/verification/prepared-regressions.json',JSON.stringify({originalMembershipsRestored:true,results},null,2))
assert.ok(results.every(row=>row.pass),'All prepared source regression suites must pass')
