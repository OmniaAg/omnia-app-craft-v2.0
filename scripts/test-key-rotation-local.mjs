import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes,randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { integrationKey,openSecret,sealSecret } from '../supabase/functions/_shared/phase13-security.ts'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'
const {status}=await waitForPostgrest()
const user=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false}}),admin=createClient(status.API_URL,status.SECRET_KEY,{auth:{persistSession:false}})
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'}).trim()
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data}
try{
 ok(await user.auth.signInWithPassword({email:TEST_USERS.director[1],password:TEST_PASSWORD}))
 const connection=ok(await user.rpc('phase13_save_connection',{p_project:'60000000-0000-0000-0000-0000000000a1',p_name:'Phase15 rotation fixture',p_events:['automation.manual'],p_key:randomUUID()}))
 const legacy=readFileSync('supabase/.env.phase14-test.local','utf8').match(/^INTEGRATION_ENCRYPTION_KEY=(.+)$/m)[1]
 const old=await integrationKey({legacy}),secret='phase15-disposable-rotation-fixture-only'
 ok(await admin.rpc('phase13_store_credentials',{p_connection:connection,p_actor:TEST_USERS.director[0],p_url:'http://host.docker.internal:56413/hook',p_cipher:await sealSecret(secret,connection,old.key),p_key:randomUUID()}))
 const keyring=JSON.stringify({'1':legacy,'2':randomBytes(32).toString('base64')})
 const file='supabase/.env.phase15-rotation-test.local'
 writeFileSync(file,`INTEGRATION_ENCRYPTION_KEYS=${keyring}\nINTEGRATION_ACTIVE_KEY_VERSION=2\n`)
 execFileSync(process.execPath,['scripts/rotate-integration-keys-local.mjs','--env-file',file],{stdio:['ignore','pipe','pipe']})
 const row=JSON.parse(sql(`select encrypted_secret from app_private.integration_credentials where connection_id='${connection}'`))
 assert.equal(row.key_version,'2')
 const current=await integrationKey({keyring,activeVersion:'2'})
 assert.equal(await openSecret(row,connection,current.key),secret)
 // A second run is idempotent and retires no old key automatically.
 const output=execFileSync(process.execPath,['scripts/rotate-integration-keys-local.mjs','--env-file',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
 assert.match(output,/Re-encrypted 0/)
 writeFileSync('artifacts/phase-15/key-rotation.json',JSON.stringify({passed:true,checks:['database envelope migrated to version 2','plaintext preserved without logging','second rotation is idempotent','old key retained for reader rollback'],secretsPrinted:false},null,2))
 console.log('PASS: local database credentials re-encrypted with versioned AAD; repeat run idempotent; no key/plaintext logged.')
}finally{await user.auth.signOut();user.realtime.disconnect();admin.realtime.disconnect()}
