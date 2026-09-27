import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const PROJECT_A = '60000000-0000-0000-0000-0000000000a1'
const ORGANIZATION_A = '30000000-0000-0000-0000-00000000000a'

function ok(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`)
  return result.data
}

async function main() {
  const { status } = await waitForPostgrest()
  assert.equal(new URL(status.API_URL).hostname, '127.0.0.1')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  async function login(name) {
    const [id, email] = TEST_USERS[name]
    ok(await admin.auth.admin.updateUserById(id, { password: TEST_PASSWORD, email_confirm: true }), `bootstrap ${name}`)
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } })
    ok(await client.auth.signInWithPassword({ email, password: TEST_PASSWORD }), `login ${name}`)
    return client
  }
  const director = await login('director')
  const pm = await login('pm')
  const reviewer = await login('reviewerA')
  const foreign = await login('viewerB')
  const reviewerId = TEST_USERS.reviewerA[0]
  const projectMembership = ok(await director.rpc('add_project_member', {
    project_id: PROJECT_A, user_id: reviewerId, member_type: 'client',
    responsibility: 'client_member', idempotency_key: randomUUID(),
  }), 'reviewer project eligibility')
  const channel = ok(await pm.rpc('create_project_channel', { p_project: PROJECT_A }), 'create project channel')
  ok(await pm.rpc('add_channel_member', { p_channel: channel, p_user: reviewerId }), 'add reviewer')
  assert.equal((await reviewer.rpc('my_channels')).data.some(row => row.id === channel), true)
  assert.equal((await foreign.rpc('my_channels')).data.some(row => row.id === channel), false)
  assert.equal((await foreign.rpc('channel_messages', { p_channel: channel })).error?.code, '42501')
  assert.equal((await foreign.rpc('send_message', { p_channel: channel, p_body: 'forged', p_client_message_id: randomUUID() })).error?.code, '42501')
  assert.equal((await foreign.from('messages').insert({ channel_id: channel, author_user_id: reviewerId,
    client_message_id: randomUUID(), body: 'forged' })).error?.code, '42501')
  console.log('ok - project channel eligibility, RLS, direct mutation denial')

  let received
  const receivedPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('authorized Realtime message not received')), 20000)
    received = payload => { clearTimeout(timeout); resolve(payload) }
  })
  const subscription = reviewer.channel(`test-messages:${channel}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel}` }, received)
  let notificationReceived
  const notificationPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('live notification not received')), 20000)
    notificationReceived = payload => { clearTimeout(timeout); resolve(payload) }
  })
  const notificationSubscription = reviewer.channel(`test-notifications:${reviewerId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `recipient_id=eq.${reviewerId}` }, notificationReceived)
    .subscribe()
  let foreignEvents = 0
  const foreignSubscription = foreign.channel(`test-foreign:${channel}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel}` }, () => { foreignEvents += 1 })
    .subscribe()
  await new Promise((resolve, reject) => {
    subscription.subscribe(state => state === 'SUBSCRIBED' ? resolve() : state === 'CHANNEL_ERROR' ? reject(new Error('Realtime join failed')) : undefined)
    setTimeout(() => reject(new Error('Realtime join timeout')), 12000)
  })
  await new Promise(resolve => setTimeout(resolve, 1500))
  const key = randomUUID()
  const sent = ok(await pm.rpc('send_message', { p_channel: channel, p_body: 'Mensaje realtime A', p_client_message_id: key }), 'PM send')
  assert.equal(ok(await pm.rpc('send_message', { p_channel: channel, p_body: 'Mensaje realtime A', p_client_message_id: key }), 'retry'), sent)
  const event = await receivedPromise
  assert.equal(event.new.id, sent)
  assert.equal((await notificationPromise).new.message_id, sent)
  await new Promise(resolve => setTimeout(resolve, 500))
  assert.equal(foreignEvents, 0, 'foreign client received a message event')
  assert.equal(ok(await reviewer.rpc('channel_messages', { p_channel: channel } ), 'persisted history')[0].id, sent)
  const notification = ok(await reviewer.from('notifications').select('id,kind,read_at').eq('message_id', sent).single(), 'reviewer notification')
  assert.equal(notification.kind, 'message_received')
  assert.equal(notification.read_at, null)
  ok(await reviewer.rpc('mark_portal_notification_read', { notification_id: notification.id }), 'mark notification read')
  assert.notEqual(ok(await reviewer.from('notifications').select('read_at').eq('id', notification.id).single(), 'read state').read_at, null)
  console.log('ok - live PM to client, retry, persisted notification and read state')
  let pmReceived
  const pmReceivedPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PM Realtime reply not received')), 12000)
    pmReceived = payload => { clearTimeout(timeout); resolve(payload) }
  })
  const pmSubscription = pm.channel(`test-pm:${channel}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel}` }, pmReceived)
  await new Promise((resolve, reject) => {
    pmSubscription.subscribe(state => state === 'SUBSCRIBED' ? resolve() : state === 'CHANNEL_ERROR' ? reject(new Error('PM Realtime join failed')) : undefined)
    setTimeout(() => reject(new Error('PM Realtime join timeout')), 12000)
  })
  await new Promise(resolve => setTimeout(resolve, 500))
  const reply = ok(await reviewer.rpc('send_message', { p_channel: channel, p_body: 'Respuesta realtime B', p_client_message_id: randomUUID() }), 'client reply')
  assert.equal((await pmReceivedPromise).new.id, reply)
  assert.equal(ok(await pm.rpc('channel_messages', { p_channel: channel }), 'PM history')[0].id, reply)
  await reviewer.removeChannel(subscription)
  await reviewer.removeChannel(notificationSubscription)
  await pm.removeChannel(pmSubscription)
  await foreign.removeChannel(foreignSubscription)
  console.log('ok - client to PM live reply; foreign Realtime event denied')
  if (!process.argv.includes('--keep-reviewer')) {
    ok(await director.rpc('revoke_project_member', { membership_id: projectMembership, idempotency_key: randomUUID() }), 'revoke reviewer project membership')
    assert.equal((await reviewer.rpc('channel_messages', { p_channel: channel })).error?.code, '42501')
    assert.equal((await reviewer.rpc('send_message', { p_channel: channel, p_body: 'late', p_client_message_id: randomUUID() })).error?.code, '42501')
    console.log('ok - project revocation blocks future reads and sends')
  }
  const newcomerEmail = `phase10.${randomUUID()}@omnia.local`
  const newcomerUser = ok(await admin.auth.admin.createUser({
    email: newcomerEmail, password: TEST_PASSWORD, email_confirm: true,
  }), 'create local client fixture').user
  assert.match(newcomerUser.id, /^[0-9a-f-]{36}$/)
  const localSql = sql => execFileSync('docker', ['exec', 'supabase_db_omnia-craft', 'psql',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
  localSql(`insert into public.profiles(user_id,display_name) values('${newcomerUser.id}','Phase 10 New Client') on conflict(user_id) do nothing`)
  localSql(`insert into public.client_memberships(user_id,organization_id,role_key,status) values('${newcomerUser.id}','${ORGANIZATION_A}','client_viewer','active')`)
  const newcomer = createClient(status.API_URL, status.PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  ok(await newcomer.auth.signInWithPassword({ email: newcomerEmail, password: TEST_PASSWORD }), 'new client login')
  const general = ok(await newcomer.rpc('my_channels'), 'new client channels')
    .find(row => row.kind === 'organization' && row.organization_id === ORGANIZATION_A)
  assert.ok(general, 'new active client was not added to general channel')
  ok(await newcomer.rpc('send_message', { p_channel: general.id, p_body: 'Nuevo cliente en general',
    p_client_message_id: randomUUID() }), 'new client general send')
  localSql(`update public.client_memberships set status='suspended' where user_id='${newcomerUser.id}' and organization_id='${ORGANIZATION_A}'`)
  assert.equal((await newcomer.rpc('channel_messages', { p_channel: general.id })).error?.code, '42501')
  console.log('ok - new client auto-joins general channel, sends, and loses access on suspension')
  newcomer.realtime.disconnect()
  for (const client of [director, pm, reviewer, foreign, admin]) client.realtime.disconnect()
}

main().catch(error => { console.error(error); process.exitCode = 1 })
