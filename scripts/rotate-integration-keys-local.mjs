import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { integrationKey,openSecret,sealSecret } from '../supabase/functions/_shared/phase13-security.ts'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
getLocalSupabaseStatus() // Mandatory loopback guard; this helper never connects remotely.
const envIndex=process.argv.indexOf('--env-file')
const envFile=envIndex===-1?'supabase/.env.local':process.argv[envIndex+1]
if(!envFile)throw new Error('An explicit local environment file is required')
const env=Object.fromEntries(readFileSync(envFile,'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const index=line.indexOf('=');return[line.slice(0,index),line.slice(index+1)]}))
const options={keyring:env.INTEGRATION_ENCRYPTION_KEYS,legacy:env.INTEGRATION_ENCRYPTION_KEY,activeVersion:env.INTEGRATION_ACTIVE_KEY_VERSION}
const current=await integrationKey(options)
const query=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
// No plaintext/ciphertext/key is written to artifacts or logged. All changes
// use compare-and-swap inside one transaction; any concurrent edit rolls back.
const rows=JSON.parse(query('select coalesce(json_agg(row_to_json(c)),\'[]\') from app_private.integration_credentials c;'))
let statements='begin;set local lock_timeout=\'5s\';set local statement_timeout=\'30s\';',count=0
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
for(const row of rows) {
 if(row.encrypted_secret.key_version===current.version)continue
 const old=await integrationKey(options,row.encrypted_secret.key_version)
 const next=await sealSecret(await openSecret(row.encrypted_secret,row.connection_id,old.key),row.connection_id,current.key,current.version)
 statements+=`do $$begin update app_private.integration_credentials set encrypted_secret=${literal(next)},updated_at=now() where connection_id='${row.connection_id}' and encrypted_secret=${literal(row.encrypted_secret)};if not found then raise exception 'rotation_conflict';end if;end;$$;`
 count++
}
query(statements+'commit;')
console.log(`Re-encrypted ${count} local credentials to key version ${current.version}; no secret material logged.`)
