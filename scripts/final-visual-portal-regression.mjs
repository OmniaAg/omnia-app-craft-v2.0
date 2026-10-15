import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const sql = input => execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'}).trim()
const filter="project_id='60000000-0000-0000-0000-0000000000a1' and user_id='10000000-0000-0000-0000-000000000006'"
const original=JSON.parse(sql(`select coalesce(json_agg(p),'[]') from public.project_memberships p where ${filter};`))
assert.ok(original.length<=1)
let output='',pass=false
try {
  sql(`delete from public.project_memberships where ${filter};`)
  output=execFileSync(process.execPath,['scripts/test-portal-integration.mjs'],{encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']})
  pass=true
} catch(error) {output=String(error.stdout??'')+String(error.stderr??'');process.exitCode=1}
finally {
  sql(`delete from public.project_memberships where ${filter};`)
  if(original.length) {
    const json=JSON.stringify(original[0]).replaceAll("'","''")
    sql(`insert into public.project_memberships select * from json_populate_record(null::public.project_memberships,'${json}'::json);`)
  }
  const restored=JSON.parse(sql(`select coalesce(json_agg(p),'[]') from public.project_memberships p where ${filter};`))
  assert.deepEqual(restored,original,'Existing membership must be restored exactly')
  writeFileSync('artifacts/final-visual-qa/verification/test-portal-prepared.log',output)
  writeFileSync('artifacts/final-visual-qa/verification/portal-prepared.json',JSON.stringify({pass,fixture:'Reviewer A starts without A1, as required by the existing test',originalMembershipRestored:true},null,2))
}
console.log(output)
