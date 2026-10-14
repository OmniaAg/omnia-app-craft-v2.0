import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const stage = process.argv.includes('--after') ? 'after' : 'before'
const directory = 'artifacts/phase-15'
mkdirSync(directory, { recursive: true })
const sql = statement => execFileSync('docker', ['exec', '-i', 'supabase_db_omnia-craft', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-t', '-A'], { input: statement, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
const tables = JSON.parse(sql(`select coalesce(json_agg(t),'[]') from (select n.nspname as schema,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
  has_table_privilege('anon',c.oid,'select') as anon_select,has_table_privilege('authenticated',c.oid,'select') as authenticated_select
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and c.relkind in ('r','v','m') order by 1,2) t;`))
const functions = JSON.parse(sql(`select coalesce(json_agg(t),'[]') from (select n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') as service_execute,pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') order by 1,2) t;`))
const policies = JSON.parse(sql(`select coalesce(json_agg(t),'[]') from (select * from pg_policies where schemaname in ('public','app_private','storage') order by schemaname,tablename,policyname) t;`))
const defaults = sql('select defaclrole::regrole,defaclnamespace::regnamespace,defaclobjtype,defaclacl from pg_default_acl;')
writeFileSync(`${directory}/database-inventory-${stage}.json`, JSON.stringify({ tables, functions, policies, defaults }, null, 2))
const assets = readdirSync('dist/assets').filter(name => name.endsWith('.js')).map(name => { const bytes=readFileSync(`dist/assets/${name}`);return {name,bytes:bytes.length,gzipBytes:gzipSync(bytes).length} }).sort((a,b) => b.bytes-a.bytes)
writeFileSync(`${directory}/bundle-${stage}.json`, JSON.stringify({ assets, totalJsBytes:assets.reduce((sum,item)=>sum+item.bytes,0),precache:JSON.parse(readFileSync('artifacts/phase-14/precache.json','utf8')) }, null, 2))
const unsafe=functions.filter(item=>item.prosecdef && !item.proconfig?.some(value=>/^search_path=(""|)$/.test(value)))
if(stage==='after' && assets[0].bytes>550000)throw new Error('Main bootstrap exceeds the documented 550kB budget')
console.log(JSON.stringify({stage,tables:tables.length,functions:functions.length,definers:functions.filter(item=>item.prosecdef).length,unsafeSearchPaths:unsafe.map(item=>item.proname),anonFunctions:functions.filter(item=>item.anon_execute).map(item=>`${item.schema}.${item.proname}`),privateAuthenticatedFunctions:functions.filter(item=>item.schema==='app_private'&&item.authenticated_execute).map(item=>item.proname),main:assets[0]},null,2))
