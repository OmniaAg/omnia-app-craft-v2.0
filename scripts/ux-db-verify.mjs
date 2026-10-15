import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'

getLocalSupabaseStatus()
const database='omnia_ux_refactor_test'
const dir='artifacts/ux-refactor/verification'
mkdirSync(dir,{recursive:true})
const docker=(args,options={})=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft',...args],{maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe'],...options})
const sql=(input,db='postgres')=>docker(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],{input:'set client_min_messages=warning;\n'+input,encoding:'utf8'}).trim()
assert.equal(sql(`select count(*) from pg_database where datname='${database}'`),'0','Scratch database must not already exist')
const dump=docker(['pg_dump','-U','postgres','-d','postgres','--format=custom','--no-owner','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=cron','--exclude-extension=pg_cron'])
sql(`create database ${database} template template0`)
const results=[]
try {
  docker(['pg_restore','-U','supabase_admin',`--dbname=${database}`,'--exit-on-error','--no-owner'],{input:dump,stdio:['pipe','pipe','pipe']})
  sql('drop schema public cascade; drop schema app_private cascade; create schema public authorization postgres; grant usage on schema public to anon,authenticated,service_role; truncate auth.users cascade; truncate storage.objects cascade; truncate storage.buckets cascade;',database)
  for(const file of readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort())sql(readFileSync(`supabase/migrations/${file}`,'utf8'),database)
  sql(readFileSync('supabase/seed.sql','utf8'),database)
  sql('create extension if not exists pgtap with schema extensions;',database)
  for(const file of readdirSync('supabase/tests/database').filter(file=>file.endsWith('.sql')).sort()) {
    let output,exit=true
    try {output=sql(readFileSync(`supabase/tests/database/${file}`,'utf8'),database)}catch(error){exit=false;output=String(error.stdout??'')+String(error.stderr??'')}
    writeFileSync(`${dir}/${file}.log`,output)
    const assertions=(output.match(/^ok \d+/gm)??[]).length
    const pass=exit&&assertions>0&&!/^not ok|^# Looks like you failed|ERROR:/m.test(output)
    results.push({file,pass,assertions})
    console.log(`${pass?'PASS':'FAIL'} ${file}: ${assertions}`)
  }
}finally {sql(`drop database ${database}`);writeFileSync(`${dir}/database.json`,JSON.stringify({sourceUntouched:true,isolated:true,results},null,2))}
assert.ok(results.every(row=>row.pass),'All isolated pgTAP suites must pass')
