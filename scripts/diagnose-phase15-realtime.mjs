import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'
const status=getLocalSupabaseStatus(),clients=[]
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-U','postgres','-d','postgres'],{input,encoding:'utf8'}).trim()
async function login(key){const c=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);const r=await c.auth.signInWithPassword({email:TEST_USERS[key][1],password:TEST_PASSWORD});if(r.error)throw r.error;return c}
const reviewer=await login('reviewerA'),pm=await login('pm')
try{
 const channels=await reviewer.rpc('my_channels'),channel=channels.data.find(c=>c.project_id==='60000000-0000-0000-0000-0000000000a1').id
 let events=0
 const sub=reviewer.channel('diagnostic-'+randomUUID()).on('system',{},p=>console.log('system',JSON.stringify({message:p.message,status:p.status,extension:p.extension}))).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`channel_id=eq.${channel}`},()=>{events++;console.log('event received')})
 await new Promise((resolve,reject)=>sub.subscribe(state=>state==='SUBSCRIBED'?resolve():state==='CHANNEL_ERROR'?reject(new Error('channel error')):undefined))
 await new Promise(resolve=>setTimeout(resolve,3000))
 console.log('registered',sql('select entity::regclass,count(*)from realtime.subscription group by entity;'))
 const sent=await pm.rpc('send_message',{p_channel:channel,p_body:'Phase15 realtime diagnosis',p_client_message_id:randomUUID()})
 console.log('persisted send',!sent.error)
 await new Promise(resolve=>setTimeout(resolve,4000))
 console.log('events',events)
}finally{for(const c of clients){c.realtime.disconnect();await c.auth.signOut()}}
