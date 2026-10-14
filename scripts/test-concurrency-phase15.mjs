import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, createECDH, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'
const {status}=await waitForPostgrest(),checks=[],clients=[]
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input,encoding:'utf8'}).trim()
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data}
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log(`PASS ${name}`)}
async function client(email,service=false) {
 const value=createClient(status.API_URL,service?status.SECRET_KEY:status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(value)
 if(email)ok(await value.auth.signInWithPassword({email,password:TEST_PASSWORD}))
 return value
}
const project='60000000-0000-0000-0000-0000000000a1',org='30000000-0000-0000-0000-00000000000a'
try {
 const [a,b,workerA,workerB]=await Promise.all([client(TEST_USERS.director[1]),client(TEST_USERS.director[1]),client(null,true),client(null,true)])
 const doc=ok(await a.from('billing_documents').insert({organization_id:org,project_id:project,subtotal_amount:100,total_amount:100}).select('id').single()).id
 ok(await a.from('billing_document_items').insert({billing_document_id:doc,description:'Race fixture',unit_price:100,line_total:100}))
 const key=randomUUID(),issues=await Promise.all([a.rpc('issue_billing_document',{p_document_id:doc,p_idempotency_key:key}),b.rpc('issue_billing_document',{p_document_id:doc,p_idempotency_key:key})])
 check('two independent sessions same issue key both receive one authoritative ID',issues.every(result=>!result.error&&result.data===doc))
 check('one issue event and one number',sql(`select count(*) from public.domain_events where resource_id='${doc}'and event_type='billing.document.issued'`)==='1'&&!!ok(await a.from('billing_documents').select('number').eq('id',doc).single()).number)
 const args=amount=>({p_document_id:doc,p_amount:amount,p_method:'transfer',p_received_at:'2030-01-01T00:00:00Z',p_reference:null,p_notes:null,p_file_asset_id:null,p_idempotency_key:randomUUID()})
 const payments=await Promise.all([a.rpc('record_payment',args(60)),b.rpc('record_payment',args(60))])
 check('concurrent overpayment admits one and denies one',payments.filter(result=>!result.error).length===1&&payments.filter(result=>result.error?.message==='overpayment_rejected').length===1)
 check('paid amount is exactly 60 with no lost update',sql(`select sum(amount)from public.payment_records where billing_document_id='${doc}'and voided_at is null`)==='60.00')
 const automation=ok(await a.rpc('phase13_save_automation',{p_project:project,p_name:'Phase15 worker race',p_enabled:true,p_trigger:'manual',p_event:null,p_conditions:[],p_actions:[{type:'create_work_item',title:'Phase15 fenced work',priority:'normal'}],p_key:randomUUID()}))
 const run=ok(await a.rpc('phase13_manual_run',{p_automation:automation,p_key:randomUUID()}))
 const claims=await Promise.all([workerA.rpc('phase13_claim_run',{p_run:run}),workerB.rpc('phase13_claim_run',{p_run:run})])
 const claim=claims.map(ok).find(Boolean)
 check('two workers claim an automation once',claims.map(ok).filter(Boolean).length===1)
 sql(`update public.automation_runs set lease_until=now()-interval '1 second' where id='${run}'`)
 const replacement=ok(await workerB.rpc('phase13_claim_run',{p_run:run}))
 check('expired automation lease is reclaimed with a new token',replacement.token!==claim.token)
 check('late automation worker cannot finish',!!(await workerA.rpc('phase13_finish_run',{p_run:run,p_token:claim.token})).error)
 ok(await workerB.rpc('phase13_prepare_step',{p_run:run,p_token:replacement.token,p_position:0}))
 ok(await workerB.rpc('phase13_finish_run',{p_run:run,p_token:replacement.token}))
 check('one fenced work effect',sql("select count(*)from public.work_items where title='Phase15 fenced work'")==='1')
 const [ca,cb]=await Promise.all([client(TEST_USERS.adminA[1]),client(TEST_USERS.viewerB[1])])
 const ecdh=createECDH('prime256v1');ecdh.generateKeys()
 const subscription={endpoint:`https://fcm.googleapis.com/fcm/send/phase15_${randomUUID()}`,device_token:randomUUID(),keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}
 const registrations=await Promise.all([ca.rpc('register_push_subscription',{p_subscription:subscription,p_surface:'portal'}),cb.rpc('register_push_subscription',{p_subscription:subscription,p_surface:'portal'})])
 check('shared endpoint race admits one owner and rejects the other',registrations.filter(result=>!result.error).length===1&&registrations.filter(result=>result.error?.message==='endpoint_owned').length===1&&sql(`select count(*)from app_private.push_subscriptions where endpoint='${subscription.endpoint}'and active`)==='1')
 const owner=sql(`select user_id from app_private.push_subscriptions where endpoint='${subscription.endpoint}'and active`)
 const channel=sql(`select id from public.channels where organization_id='${owner===TEST_USERS.adminA[0]?org:'30000000-0000-0000-0000-00000000000b'}'and kind='organization'limit 1`)
 ok(await a.rpc('send_message',{p_channel:channel,p_body:'Phase15 generic push fixture',p_client_message_id:randomUUID()}))
 const pushClaims=await Promise.all([workerA.rpc('push_claim_delivery'),workerB.rpc('push_claim_delivery')])
 const push=pushClaims.map(ok).find(Boolean)
 check('two Push workers claim one delivery',pushClaims.map(ok).filter(Boolean).length===1)
 sql(`update app_private.push_delivery_outbox set lease_until=now()-interval '1 second' where id='${push.id}'`)
 const newPush=ok(await workerB.rpc('push_claim_delivery'))
 check('Push expired lease obtains a new fencing token',newPush.token!==push.token)
 ok(await workerA.rpc('push_finish_delivery',{p_delivery:push.id,p_token:push.token,p_status:201}))
 check('late Push finish is a no-op and cannot overwrite the new worker',sql(`select status||':'||claim_token::text from app_private.push_delivery_outbox where id='${push.id}'`)==='sending:'+newPush.token)
 ok(await workerB.rpc('push_finish_delivery',{p_delivery:newPush.id,p_token:newPush.token,p_status:201}))
 writeFileSync('artifacts/phase-15/concurrency.json',JSON.stringify({passed:checks.length,checks,transport:'real independent Auth sessions/PostgREST/PostgreSQL transactions; no mocked locks'},null,2))
}finally{for(const value of clients){value.realtime.disconnect();if(value.auth)await value.auth.signOut()}}
