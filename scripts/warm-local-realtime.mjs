import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'
const status=getLocalSupabaseStatus()
const client=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
try{
 assert.equal((await client.auth.signInWithPassword({email:TEST_USERS.director[1],password:TEST_PASSWORD})).error,null)
 const channel=client.channel('phase15-cdc-readiness').on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`recipient_id=eq.${TEST_USERS.director[0]}`},()=>{})
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local CDC join timeout')),15000);channel.subscribe(state=>{if(state==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(state==='CHANNEL_ERROR'){clearTimeout(timer);reject(new Error('Local CDC join failed'))}})})
 const deadline=Date.now()+15000;let ready=false
 while(Date.now()<deadline){
  const active=execFileSync('docker',['exec','supabase_db_omnia-craft','psql','-X','-t','-A','-U','postgres','-d','postgres','-c',"select exists(select 1 from pg_replication_slots where slot_name='supabase_realtime_replication_slot_' and active)and exists(select 1 from realtime.subscription where entity='public.notifications'::regclass)"],{encoding:'utf8'}).trim()
  if(active==='t'){ready=true;break}
  await new Promise(resolve=>setTimeout(resolve,100))
 }
 assert.ok(ready,'Local CDC slot/subscription must be active before the test')
 console.log('Local CDC readiness confirmed using a real notification subscription and active replication slot; no event assertion substituted.')
}finally{client.realtime.disconnect();await client.auth.signOut()}
