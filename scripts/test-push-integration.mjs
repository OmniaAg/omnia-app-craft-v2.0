import assert from 'node:assert/strict'
import { createECDH, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_USERS, TEST_PASSWORD } from './test-fixtures/credentials.mjs'
const {status}=await waitForPostgrest()
assert.equal(new URL(status.API_URL).hostname,'127.0.0.1')
const ok=(result,label) => { assert.equal(result.error,null,`${label}: ${result.error?.message}`); return result.data }
const clients=[]
const checks=[]
const check=(name,fn) => { fn(); checks.push(name); console.log(`ok - ${name}`) }
const admin=createClient(status.API_URL,status.SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const sql=query => execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-t','-A'],{input:query,encoding:'utf8'}).trim()
const rows=query => JSON.parse(sql(`select coalesce(json_agg(q),'[]') from (${query}) q;`))
async function login(name) {
  const client=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  clients.push(client); ok(await client.auth.signInWithPassword({email:TEST_USERS[name][1],password:TEST_PASSWORD}),`login ${name}`)
  return client
}
const suffix=randomUUID().replaceAll('-','')
function subscription(ending) {
  const ecdh=createECDH('prime256v1'); ecdh.generateKeys()
  return {endpoint:`https://fcm.googleapis.com/fcm/send/phase14_${suffix}_${ending}`,device_token:randomUUID(),
    keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}
}
const workerToken=readFileSync('supabase/.env.phase14-test.local','utf8').match(/^PUSH_WORKER_TOKEN=(.+)$/m)[1]
async function dispatch() {
  const response=await fetch(`${status.API_URL}/functions/v1/push-api`,{method:'POST',headers:{apikey:status.PUBLISHABLE_KEY,'content-type':'application/json','x-push-worker-token':workerToken},body:'{"operation":"dispatch"}'})
  assert.equal(response.status,200,`Edge dispatch HTTP ${response.status}: ${await response.clone().text()}`)
  return response.json()
}
let a,b,director, aSubscription,bSubscription,aReader
try {
  a=await login('adminA'); b=await login('viewerB'); director=await login('director')
  aReader=a
  const endpoint=subscription('normal'); aSubscription=endpoint
  const aId=ok(await a.rpc('register_push_subscription',{p_subscription:endpoint,p_surface:'portal'}),'register A')
  assert.equal(ok(await a.rpc('register_push_subscription',{p_subscription:endpoint,p_surface:'portal'}),'repeat A'),aId)
  const foreign=await b.rpc('register_push_subscription',{p_subscription:endpoint,p_surface:'portal'})
  check('active endpoint ownership and registration idempotency',() => assert.equal(foreign.error?.code,'42501'))
  bSubscription=subscription('B')
  const bId=ok(await b.rpc('register_push_subscription',{p_subscription:bSubscription,p_surface:'portal'}),'register B')
  assert.ok((await a.rpc('register_push_subscription',{p_subscription:{...endpoint,user_id:TEST_USERS.viewerB[0]},p_surface:'portal'})).error)
  const channel=ok(await director.rpc('my_channels'),'channels').find(c => c.kind==='organization' && c.organization_id==='30000000-0000-0000-0000-00000000000a').id
  async function notify() {
    const message=ok(await director.rpc('send_message',{p_channel:channel,p_body:'Contenido privado Phase14',p_client_message_id:randomUUID()}),'message source')
    return ok(await aReader.from('notifications').select('id').eq('message_id',message).single(),'notification A').id
  }
  const notification=await notify()
  const intent=rows(`select id,subscription_id from app_private.push_delivery_outbox where notification_id='${notification}'`)
  check('notification A targets A only, including foreign user device',() => { assert.equal(intent.length,1); assert.equal(intent[0].subscription_id,aId); assert.notEqual(intent[0].subscription_id,bId) })
  const claims=await Promise.all([admin.rpc('push_claim_delivery'),admin.rpc('push_claim_delivery')])
  const claimed=claims.map(c => ok(c,'concurrent claim')).filter(Boolean)
  check('concurrent workers produce one claim',() => assert.equal(claimed.length,1))
  const material=ok(await admin.rpc('push_delivery_material',{p_delivery:claimed[0].id,p_token:claimed[0].token}),'material')
  check('payload contains only safe identifiers',() => { assert.deepEqual(Object.keys(material.payload).sort(),['device_token','endpoint_hash','notification_id','surface']); assert.ok(!JSON.stringify(material.payload).includes('Contenido')) })
  ok(await admin.rpc('push_finish_delivery',{p_delivery:claimed[0].id,p_token:claimed[0].token,p_status:201}),'finish claim')
  const duplicate=await dispatch()
  check('delivered intent never reclaims or resends',() => assert.equal(duplicate.processed,0))
  const normal=await notify(); assert.equal((await dispatch()).processed,1)
  check('actual local Edge dispatcher encrypts, signs and records one delivery',() => assert.equal(rows(`select status from app_private.push_delivery_outbox where notification_id='${normal}'`)[0].status,'delivered'))
  const temporary=subscription('temporary'), gone=subscription('gone')
  const tempId=ok(await a.rpc('register_push_subscription',{p_subscription:temporary,p_surface:'portal'}),'register temporary')
  const goneId=ok(await a.rpc('register_push_subscription',{p_subscription:gone,p_surface:'portal'}),'register gone')
  const retryNotification=await notify(); await dispatch()
  check('429 retries with future backoff; 410 deactivates',() => {
    const retry=rows(`select status,attempts,available_at>now() as future from app_private.push_delivery_outbox where notification_id='${retryNotification}' and subscription_id='${tempId}'`)[0]
    assert.equal(retry.status,'pending'); assert.equal(retry.attempts,1); assert.equal(retry.future,true)
    assert.equal(rows(`select active from app_private.push_subscriptions where id='${goneId}'`)[0].active,false)
  })
  sql(`update app_private.push_delivery_outbox set available_at=now() where notification_id='${retryNotification}' and subscription_id='${tempId}';`)
  assert.equal((await dispatch()).processed,1)
  check('temporary failure recovers without another logical delivery',() => {
    const row=rows(`select status,attempts from app_private.push_delivery_outbox where notification_id='${retryNotification}' and subscription_id='${tempId}'`)[0]
    assert.equal(row.status,'delivered'); assert.equal(row.attempts,2)
  })
  ok(await a.rpc('unregister_push_subscription',{p_endpoint:temporary.endpoint}),'disable temp')
  const bounded=await notify()
  for (let i=0;i<5;i++) {
    const claim=ok(await admin.rpc('push_claim_delivery'),'bounded claim'); assert.ok(claim)
    ok(await admin.rpc('push_finish_delivery',{p_delivery:claim.id,p_token:claim.token,p_status:503}),'bounded failure')
    sql(`update app_private.push_delivery_outbox set available_at=now() where notification_id='${bounded}' and status='pending';`)
  }
  check('retries terminate after five attempts',() => assert.deepEqual(rows(`select status,attempts,last_error from app_private.push_delivery_outbox where notification_id='${bounded}'`)[0],{status:'failed',attempts:5,last_error:'retry_exhausted'}))
  ok(await a.rpc('unregister_push_subscription',{p_endpoint:endpoint.endpoint}),'disable A')
  ok(await a.rpc('unregister_push_subscription',{p_endpoint:endpoint.endpoint}),'repeat disable')
  const disabled=await notify()
  check('disabled device gets no future delivery',() => assert.equal(rows(`select id from app_private.push_delivery_outbox where notification_id='${disabled}'`).length,0))
  ok(await a.rpc('register_push_subscription',{p_subscription:endpoint,p_surface:'portal'}),'reenable A')
  const pending=await notify()
  await a.auth.signOut()
  aReader=await login('adminA')
  const bOnDevice=await login('viewerB')
  // Session-bound server association must disappear even if browser cleanup was missed.
  check('logout/session invalidation blocks queued A push on B device',() => assert.equal(rows(`select id from app_private.push_subscriptions where endpoint='${endpoint.endpoint}'`).length,0))
  ok(await bOnDevice.rpc('register_push_subscription',{p_subscription:endpoint,p_surface:'portal'}),'B explicit resubscription')
  await dispatch()
  check('user switch cannot deliver queued notification A to B',() => assert.equal(rows(`select id from app_private.push_delivery_outbox where notification_id='${pending}'`).length,0))
  const afterSwitch=await notify()
  check('new A notifications never target reassigned device B',() => assert.equal(rows(`select id from app_private.push_delivery_outbox where notification_id='${afterSwitch}'`).length,0))
  ok(await bOnDevice.rpc('unregister_push_subscription',{p_endpoint:endpoint.endpoint}),'cleanup switched device')
  const denied=await fetch(`${status.API_URL}/functions/v1/push-api`,{method:'POST',headers:{apikey:status.PUBLISHABLE_KEY,'content-type':'application/json'},body:'{"operation":"dispatch"}'})
  check('arbitrary browser dispatch denied',() => assert.equal(denied.status,403))
  writeFileSync('artifacts/phase-14/push-integration.json',JSON.stringify({passed:checks.length,checks,realProviderDelivery:false,sender:'local_deterministic'},null,2))
  console.log(`PASS: ${checks.length} Push integration checks`)
} finally {
  if (b && bSubscription) await b.rpc('unregister_push_subscription',{p_endpoint:bSubscription.endpoint})
  if (a && aSubscription) await a.rpc('unregister_push_subscription',{p_endpoint:aSubscription.endpoint})
  for (const client of clients) { client.realtime.disconnect(); await client.auth.signOut() }
  admin.realtime.disconnect()
}
