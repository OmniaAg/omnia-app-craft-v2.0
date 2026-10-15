import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const target='omnia_ux_verified_restore'
const container='supabase_db_omnia-craft'
const docker=(args,options={})=>execFileSync('docker',['exec','-i',container,...args],{maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe'],...options})
const sql=(input,db='template1')=>docker(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],{input,encoding:'utf8'}).trim()
assert.equal(sql(`select count(*) from pg_database where datname='${target}'`),'0')
sql(`create database ${target} owner postgres template template0`)
docker(['pg_restore','-U','supabase_admin',`--dbname=${target}`,'--exit-on-error'],{input:readFileSync('supabase/.temp/ux-refactor/before.dump')})
const counts=JSON.parse(sql(`select json_build_object('users',(select count(*) from auth.users),'projects',(select count(*) from public.projects),'work',(select count(*) from public.work_items),'files',(select count(*) from public.file_assets),'documents',(select count(*) from public.billing_documents),'messages',(select count(*) from public.messages));`,target))
assert.ok(counts.users>=9&&counts.projects>=4&&counts.work>=5&&counts.files>0,'Original backup must contain accumulated source data')
writeFileSync('supabase/.temp/ux-refactor/verified-restore.json',JSON.stringify(counts,null,2))
console.log(JSON.stringify({verified:true,database:target,counts}))
