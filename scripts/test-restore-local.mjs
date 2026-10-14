import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
getLocalSupabaseStatus()
const database='omnia_phase15_restore'
const docker=(args,options={})=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft',...args],{maxBuffer:64*1024*1024,...options})
const sql=(input,db='postgres')=>docker(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{input,encoding:'utf8'}).trim()
assert.equal(sql(`select count(*) from pg_database where datname='${database}'`),'0','Refuse to overwrite an existing restore database')
const counts=()=>sql(`select json_object_agg(name,n) from (select 'projects' name,count(*) n from public.projects union all select 'users',count(*) from auth.users union all select 'audit',count(*) from public.audit_events union all select 'billing',count(*) from public.billing_documents)t;`)
const before=JSON.parse(counts())
// Supabase owns the Realtime service schemas; its log_min_messages function
// needs platform superuser privileges unavailable to the application role.
// Restore the application/Auth/Storage schemas and their ACLs; bootstrap
// vendor Realtime/tenant configuration separately in a production rehearsal.
const dump=docker(['pg_dump','-U','postgres','-d','postgres','--format=custom','--no-owner','--exclude-schema=realtime','--exclude-schema=_realtime'])
sql(`create database ${database} template template0;`)
let success=false
try {
 docker(['pg_restore','-U','supabase_admin','--dbname='+database,'--exit-on-error','--no-owner'],{input:dump,stdio:['pipe','pipe','pipe']})
 const after=JSON.parse(sql(`select json_object_agg(name,n) from (select 'projects' name,count(*) n from public.projects union all select 'users',count(*) from auth.users union all select 'audit',count(*) from public.audit_events union all select 'billing',count(*) from public.billing_documents)t;`,database))
 assert.deepEqual(after,before)
 assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;",database),'0')
 assert.equal(sql("select has_function_privilege('anon','public.issue_billing_document(uuid,uuid)','execute') or has_function_privilege('authenticated','public.push_claim_delivery()','execute');",database),'f')
 writeFileSync('artifacts/phase-15/restore.json',JSON.stringify({passed:true,scope:'isolated local application/Auth/Storage/ACL restore; vendor realtime schemas excluded; no Cloud backup',before,after,bytes:dump.length,rlsPreserved:true,privilegesPreserved:true,secretsWrittenToDisk:false,storageObjectBytes:false},null,2))
 success=true;console.log(`PASS: local schema/data restore (${dump.length} bytes in memory); matching counts and RLS.`)
} finally {
 // Exact constant scratch name, created by this run. Never drops the source DB.
 sql(`drop database ${database};`)
 if(!success)console.error('Local restore rehearsal failed; scratch database removed.')
}
