import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const restored='omnia_ux_verified_restore',previous='omnia_ux_reset_replaced'
const sql=(input,db='template1')=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const expected=JSON.parse(readFileSync('supabase/.temp/ux-refactor/verified-restore.json','utf8'))
assert.equal(sql(`select count(*) from pg_database where datname='${restored}'`),'1')
assert.equal(sql(`select count(*) from pg_database where datname='${previous}'`),'0')
const services=['supabase_rest_omnia-craft','supabase_auth_omnia-craft','supabase_storage_omnia-craft','supabase_realtime_omnia-craft','supabase_pg_meta_omnia-craft','supabase_studio_omnia-craft']
const run=args=>execFileSync('docker',args,{stdio:['ignore','pipe','pipe']})
run(['stop',...services])
let renamed=false
try {
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()`)
  sql(`alter database postgres rename to ${previous}`)
  renamed=true
  sql(`alter database ${restored} rename to postgres`)
  sql(`grant connect on database postgres to supabase_etl_admin,supabase_storage_admin,dashboard_user`)
  sql(`do $$ declare setting record; part text; begin for setting in select s.setrole,s.setconfig from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='${previous}' loop foreach part in array setting.setconfig loop if setting.setrole=0 then execute format('alter database postgres set %I to %L',split_part(part,'=',1),substr(part,strpos(part,'=')+1)); else execute format('alter role %I in database postgres set %I to %L',pg_get_userbyid(setting.setrole),split_part(part,'=',1),substr(part,strpos(part,'=')+1)); end if; end loop; end loop; end $$`)
  const counts=JSON.parse(sql(`select json_build_object('users',(select count(*) from auth.users),'projects',(select count(*) from public.projects),'work',(select count(*) from public.work_items),'files',(select count(*) from public.file_assets),'documents',(select count(*) from public.billing_documents),'messages',(select count(*) from public.messages));`,'postgres'))
  assert.deepEqual(counts,expected)
  writeFileSync('artifacts/ux-refactor/verification/restoration.json',JSON.stringify({restored:true,counts,originalBackupVerified:true,resetDatabaseRetainedAs:previous},null,2))
  console.log(JSON.stringify({restored:true,counts}))
}catch(error) {
  if(renamed&&sql("select count(*) from pg_database where datname='postgres'")==='0')sql(`alter database ${previous} rename to postgres`)
  throw error
}finally {run(['start',...services])}
execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','migration','up','--local'],{stdio:'inherit'})
