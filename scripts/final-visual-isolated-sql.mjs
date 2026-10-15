import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const database = 'omnia_final_visual_qa'
const docker = (args, options={}) => execFileSync('docker',['exec','-i','supabase_db_omnia-craft',...args],{maxBuffer:64*1024*1024,...options})
const sql = (input, db='postgres') => docker(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],{input,encoding:'utf8'}).trim()
assert.equal(sql(`select count(*) from pg_database where datname='${database}'`),'0','Scratch database must not already exist')
const dump = docker(['pg_dump','-U','postgres','-d','postgres','--format=custom','--no-owner','--exclude-schema=realtime','--exclude-schema=_realtime'])
sql(`create database ${database} template template0;`)
const results=[]
try {
  docker(['pg_restore','-U','supabase_admin',`--dbname=${database}`,'--exit-on-error','--no-owner'],{input:dump,stdio:['pipe','pipe','pipe']})
  sql('drop schema public cascade; drop schema app_private cascade; create schema public authorization postgres; grant usage on schema public to anon, authenticated, service_role; truncate auth.users cascade; truncate storage.objects cascade; truncate storage.buckets cascade;',database)
  for(const file of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort()) {
    sql(readFileSync(`supabase/migrations/${file}`,'utf8'),database)
  }
  sql(readFileSync('supabase/seed.sql','utf8'),database)
  sql('create extension if not exists pgtap with schema extensions;',database)
  for(const file of readdirSync('supabase/tests/database').filter(name=>name.endsWith('.sql')).sort()) {
    let output=''
    try {output=sql(readFileSync(`supabase/tests/database/${file}`,'utf8'),database)}
    catch(error) {output=String(error.stdout??'')+String(error.stderr??'')}
    writeFileSync(`artifacts/final-visual-qa/verification/isolated-${file}.log`,output)
    const failed=/^not ok|^# Looks like you failed|ERROR:/m.test(output)
    const assertions=(output.match(/^ok \d+/gm)??[]).length
    results.push({file,pass:!failed&&assertions>0,assertions})
  }
  writeFileSync('artifacts/final-visual-qa/verification/isolated-sql.json',JSON.stringify({database,sourceUntouched:true,results},null,2))
  console.log(JSON.stringify(results,null,2))
  assert.ok(results.every(result=>result.pass),'Every isolated SQL suite must pass')
} finally {
  sql(`drop database ${database};`)
}
