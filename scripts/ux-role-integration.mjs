import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const status=getLocalSupabaseStatus()
const options={auth:{persistSession:false,autoRefreshToken:false}}
const admin=createClient(status.API_URL,status.SECRET_KEY,options)
const fixture=['10000000-0000-0000-0000-00000000d001','ux.developer@omnia.local']
const checks=[]
const check=(name,condition)=>{checks.push({name,pass:Boolean(condition)});assert.ok(condition,name)}
const unwrap=({data,error})=>{if(error)throw error;return data}
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input,encoding:'utf8'}).trim()
let user=(await admin.auth.admin.getUserById(fixture[0])).data.user
if(!user)user=unwrap(await admin.auth.admin.createUser({id:fixture[0],email:fixture[1],password:TEST_PASSWORD,email_confirm:true})).user
unwrap(await admin.auth.admin.updateUserById(user.id,{password:TEST_PASSWORD,email_confirm:true}))
assert.equal(user.id,fixture[0])
sql(`insert into public.profiles(user_id,display_name,timezone) values('${fixture[0]}','QA Developer','America/Mexico_City') on conflict(user_id) do nothing;
insert into public.agency_memberships(user_id,agency_id,department_id,role_key,status,classification)
select '${fixture[0]}',agency_id,department_id,'developer','active','employee' from public.agency_memberships where user_id='${TEST_USERS.director[0]}'
on conflict(user_id,agency_id) do update set role_key='developer',status='active',archived_at=null;`)
async function login(email) {const client=createClient(status.API_URL,status.PUBLISHABLE_KEY,options);unwrap(await client.auth.signInWithPassword({email,password:TEST_PASSWORD}));return client}
const director=await login(TEST_USERS.director[1]),developer=await login(fixture[1]),contributor=await login(TEST_USERS.contributor[1]),client=await login(TEST_USERS.adminA[1])
const canonical=rows=>JSON.stringify(rows.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
check('Real Auth Developer and Boss capability/scope projections match',canonical(unwrap(await director.rpc('my_capabilities')))===canonical(unwrap(await developer.rpc('my_capabilities'))))
const bossStages=unwrap(await director.from('pipeline_stages').select('key').order('key'))
check('Direct pipeline-stage RLS parity includes actual options',bossStages.length>0&&canonical(bossStages)===canonical(unwrap(await developer.from('pipeline_stages').select('key').order('key'))))
check('Client pipeline-stage access remains empty',unwrap(await client.from('pipeline_stages').select('key')).length===0)
for(const table of ['organizations','brands','projects','work_items','editorial_items','deliverables','file_assets','billing_documents','automation_definitions','integration_connections']) {
  const a=await director.from(table).select('id').order('id'),b=await developer.from(table).select('id').order('id')
  if(a.error?.code==='42P01'||b.error?.code==='42P01')throw new Error(`Unknown table in coverage: ${table}`)
  check(`${table}: identical resource rows or identical explicit denial`,a.error||b.error?a.error?.code===b.error?.code:canonical(a.data)===canonical(b.data))
}
const membership=unwrap(await developer.from('agency_memberships').select('role_key').eq('user_id',user.id).single())
check('Membership preserves Developer identifier',membership.role_key==='developer')
const forged=await contributor.from('agency_memberships').update({role_key:'developer'}).eq('user_id',TEST_USERS.contributor[0])
check('Contributor self-promotion is denied',Boolean(forged.error))
check('Client has no internal context',unwrap(await client.from('agency_memberships').select('id')).length===0)
const key=`real-auth-${Date.now()}`,scope='60000000-0000-0000-0000-0000000000a1'
let draft=unwrap(await developer.rpc('save_user_draft',{p_owner:user.id,p_kind:'work',p_scope:scope,p_key:key,p_body:{title:'Developer private draft'},p_revision:0}))
check('Real Auth saves and confirms scoped draft',draft.revision>0)
check('A different actor cannot read the draft',unwrap(await director.from('user_drafts').select('body').eq('draft_key',key)).length===0)
const stale=await developer.rpc('save_user_draft',{p_owner:user.id,p_kind:'work',p_scope:scope,p_key:key,p_body:{title:'Stale draft'},p_revision:0})
check('Real RPC rejects stale version',stale.error?.code==='40001')
const spoof=await contributor.rpc('save_user_draft',{p_owner:user.id,p_kind:'work',p_scope:scope,p_key:key,p_body:{title:'Spoofed draft'},p_revision:draft.revision})
check('Real RPC rejects owner spoofing',spoof.error?.code==='42501')
try {
  sql(`update public.agency_memberships set status='suspended' where user_id='${fixture[0]}'`)
  check('Existing JWT loses capabilities after suspension',unwrap(await developer.rpc('my_capabilities')).length===0)
  check('Existing JWT loses draft access after suspension',unwrap(await developer.from('user_drafts').select('body').eq('draft_key',key)).length===0)
}finally {sql(`update public.agency_memberships set status='active' where user_id='${fixture[0]}'`)}
const savedRevision=draft.revision
draft=unwrap(await developer.rpc('clear_user_draft',{p_owner:user.id,p_kind:'work',p_scope:scope,p_key:key,p_revision:savedRevision}))
check('Clearing advances the version',draft.revision>savedRevision)
mkdirSync('artifacts/ux-refactor/verification',{recursive:true})
writeFileSync('artifacts/ux-refactor/verification/role-auth.json',JSON.stringify({checks,fixture:{id:fixture[0],email:fixture[1]}},null,2))
console.log(JSON.stringify({checks:checks.length,failed:checks.filter(check=>!check.pass).length}))
