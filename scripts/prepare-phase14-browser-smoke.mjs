import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_USERS, TEST_PASSWORD } from './test-fixtures/credentials.mjs'
const {status}=await waitForPostgrest()
assert.equal(new URL(status.API_URL).hostname,'127.0.0.1')
const client=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const recipient=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const ok=result => { assert.equal(result.error,null,result.error?.message); return result.data }
try {
  ok(await client.auth.signInWithPassword({email:TEST_USERS.director[1],password:TEST_PASSWORD}))
  ok(await recipient.auth.signInWithPassword({email:TEST_USERS.adminA[1],password:TEST_PASSWORD}))
  const channel=ok(await client.rpc('my_channels')).find(item => item.kind==='organization' && item.organization_id==='30000000-0000-0000-0000-00000000000a')
  const message=ok(await client.rpc('send_message',{p_channel:channel.id,p_body:'Phase14 destination fixture',p_client_message_id:randomUUID()}))
  const notification=ok(await recipient.from('notifications').select('id').eq('message_id',message).single())
  writeFileSync('artifacts/phase-14/browser-smoke-fixture.json',JSON.stringify({notificationId:notification.id,channelId:channel.id},null,2))
  console.log('Authorized persisted notification fixture prepared; no credentials printed.')
} finally { await client.auth.signOut(); await recipient.auth.signOut(); client.realtime.disconnect(); recipient.realtime.disconnect() }
