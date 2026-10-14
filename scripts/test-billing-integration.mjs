import { randomUUID } from 'node:crypto'
import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const users = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  pmBasic: ['10000000-0000-0000-0000-000000000002', 'pm.basic@omnia.local'],
  client: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
}
const agencyA = '20000000-0000-0000-0000-000000000001'
const organizationA = '30000000-0000-0000-0000-00000000000a'
const projectA = '60000000-0000-0000-0000-0000000000a1'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const ok = (result, label) => {
  assert(!result.error && result.data !== null, `${label}: ${result.error?.message ?? 'missing result'}`)
  return result.data
}

async function main() {
  const { status } = await waitForPostgrest()
  assert(new URL(status.API_URL).hostname === '127.0.0.1', 'loopback API required')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  
  async function actor([id, email], password) {
    const secret = password ?? TEST_PASSWORD
    if (!password) ok(await admin.auth.admin.updateUserById(id, { password: secret, email_confirm: true }), `bootstrap ${email}`)
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await client.auth.signInWithPassword({ email, password: secret })
    assert(!error, `login ${email}: ${error?.message}`)
    return { client, password: secret }
  }

  const director = (await actor(users.director)).client
  const directorSecond = (await actor(users.director)).client
  const pmLogin = await actor(users.pm)
  const pm = pmLogin.client
  const pmBasic = (await actor(users.pmBasic)).client
  const clientSession = (await actor(users.client)).client

  console.log('ok - local actors authenticated')

  const { execSync } = await import('node:child_process')
  const insertQuery = `insert into public.capability_grants (user_id, agency_id, capability_key, scope_kind, organization_id, reason, granted_by) values ('${users.pm[0]}', '${agencyA}', 'billing.view', 'organization', '${organizationA}', 'test', '${users.director[0]}'), ('${users.pm[0]}', '${agencyA}', 'billing.create', 'organization', '${organizationA}', 'test', '${users.director[0]}'), ('${users.pm[0]}', '${agencyA}', 'billing.issue', 'organization', '${organizationA}', 'test', '${users.director[0]}'), ('${users.pm[0]}', '${agencyA}', 'billing.record_payment', 'organization', '${organizationA}', 'test', '${users.director[0]}'), ('${users.pm[0]}', '${agencyA}', 'billing.void_payment', 'organization', '${organizationA}', 'test', '${users.director[0]}'), ('${users.pm[0]}', '${agencyA}', 'billing.publish', 'organization', '${organizationA}', 'test', '${users.director[0]}') on conflict do nothing; grant select on public.capability_grants to service_role;`
  const out = execSync(`docker exec supabase_db_omnia-craft psql -U postgres -d postgres -c "${insertQuery}"`, { encoding: 'utf8', env: process.env })
  console.log('INSERT OUT:', out)
  
  const checkQuery = `select * from public.capability_grants where user_id = '${users.pm[0]}' and capability_key = 'billing.create';`
  const checkOut = execSync(`docker exec supabase_db_omnia-craft psql -U postgres -d postgres -c "${checkQuery}"`, { encoding: 'utf8' })
  console.log('PM Grants in DB:', checkOut)
  const unauthorizedInsert = await pmBasic.from('billing_documents').insert({
    organization_id: organizationA,
    project_id: projectA,
    type: 'invoice_like',
    status: 'draft',
    date: '2030-01-01',
    currency: 'MXN',
    subtotal_amount: 100,
    tax_amount: 16,
    total_amount: 116
  }).select()
  assert(unauthorizedInsert.error || unauthorizedInsert.data.length === 0, 'PM basic should NOT be able to insert billing doc')

  // 2. Draft document creation
  const doc = ok(await pm.from('billing_documents').insert({
    organization_id: organizationA,
    project_id: projectA,
    type: 'invoice_like',
    status: 'draft',
    date: '2030-01-01',
    currency: 'MXN',
    subtotal_amount: 1000,
    tax_amount: 160,
    total_amount: 1160
  }).select().single(), 'create draft doc')

  ok(await pm.from('billing_document_items').insert({
    billing_document_id: doc.id,
    description: 'Services',
    quantity: 1,
    unit_price: 1000,
    line_total: 1000
  }).select(), 'create items')

  // 3. Invalid Issue (Items mismatch)
  // Let's modify the item to have wrong totals
  await pm.from('billing_document_items').update({ unit_price: 1500, line_total: 1500 }).eq('billing_document_id', doc.id)
  let issueRes = await pm.rpc('issue_billing_document', { p_document_id: doc.id, p_idempotency_key: randomUUID() })
  assert(issueRes.error && issueRes.error.message.includes('items_total_mismatch'), 'issue should fail if items math is wrong')
  
  // Fix items
  await pm.from('billing_document_items').update({ unit_price: 1000, line_total: 1000 }).eq('billing_document_id', doc.id)
  
  // 4. Issue success
  const issueKey = randomUUID()
  const issuedId = ok(await pm.rpc('issue_billing_document', { p_document_id: doc.id, p_idempotency_key: issueKey }), 'issue document')
  const issuedIdRetry = ok(await pm.rpc('issue_billing_document', { p_document_id: doc.id, p_idempotency_key: issueKey }), 'issue retry idempotency')
  assert(issuedId === doc.id && issuedIdRetry === doc.id, 'issue and replay must return the same id')
  
  const issuedDoc = ok(await pm.from('billing_documents').select('*').eq('id', doc.id).single(), 'fetch issued')
  assert(issuedDoc.status === 'issued' && issuedDoc.number !== null, 'document should be issued and numbered')

  // 5. Freeze test
  const updateRes = await pm.from('billing_documents').update({ subtotal_amount: 500 }).eq('id', doc.id).select()
  assert(updateRes.error || updateRes.data.length === 0, 'issued commercial fields must be immutable through RLS or trigger')

  const updateItemRes = await pm.from('billing_document_items').update({ unit_price: 500 }).eq('billing_document_id', doc.id).select()
  assert(!updateItemRes.error && updateItemRes.data.length === 0, 'updating items on issued doc should silently fail via RLS')

  // 6. Record Payment
  const p1Key = randomUUID()
  const p1 = ok(await director.rpc('record_payment', {
    p_document_id: doc.id,
    p_amount: 500,
    p_method: 'transfer',
    p_received_at: '2030-01-02T10:00:00Z',
    p_reference: 'REF1',
    p_notes: '',
    p_file_asset_id: null,
    p_idempotency_key: p1Key
  }), 'partial payment')
  assert(typeof p1 === 'string', 'partial payment must return an authoritative payment id')
  
  ok(await director.rpc('record_payment', {
    p_document_id: doc.id,
    p_amount: 500,
    p_method: 'transfer',
    p_received_at: '2030-01-02T10:00:00Z',
    p_reference: 'REF1',
    p_notes: '',
    p_file_asset_id: null,
    p_idempotency_key: p1Key
  }), 'partial payment retry')

  let docState = ok(await pm.from('billing_documents').select('status').eq('id', doc.id).single(), 'fetch state')
  assert(docState.status === 'partially_paid', 'status should be partially_paid')

  // 7. Overpayment rejection
  const pOver = await director.rpc('record_payment', {
    p_document_id: doc.id,
    p_amount: 1000,
    p_method: 'transfer',
    p_received_at: '2030-01-03T10:00:00Z',
    p_reference: 'REF2',
    p_notes: '',
    p_file_asset_id: null,
    p_idempotency_key: randomUUID()
  })
  assert(pOver.error && pOver.error.message.includes('overpayment_rejected'), 'overpayment should be rejected')

  // 8. Full payment
  const p2Key = randomUUID()
  const p2 = ok(await pm.rpc('record_payment', {
    p_document_id: doc.id,
    p_amount: 660,
    p_method: 'transfer',
    p_received_at: '2030-01-03T10:00:00Z',
    p_reference: 'REF2',
    p_notes: '',
    p_file_asset_id: null,
    p_idempotency_key: p2Key
  }), 'full payment')
  
  docState = ok(await pm.from('billing_documents').select('status').eq('id', doc.id).single(), 'fetch state')
  assert(docState.status === 'paid', 'status should be paid')

  // 9. Void payment
  const voidKey = randomUUID()
  ok(await director.rpc('void_payment', {
    p_payment_id: p2,
    p_reason: 'Mistake',
    p_idempotency_key: voidKey
  }), 'void payment')
  
  docState = ok(await pm.from('billing_documents').select('status').eq('id', doc.id).single(), 'fetch state')
  assert(docState.status === 'partially_paid', 'status reverted to partially_paid')

  // 10. Publish and client view
  const publishKey = randomUUID()
  ok(await pm.rpc('publish_billing_document', { p_document_id: doc.id, p_idempotency_key: publishKey }), 'publish doc')

  const clientProj = await clientSession.from('client_billing_projections').select('*')
  assert(!clientProj.error && clientProj.data.length > 0, 'client should see published document')
  const clientView = clientProj.data.find(d => d.id === doc.id)
  assert(clientView !== undefined, 'client sees correct doc')
  assert(clientView.total_paid === 500, 'client sees correct paid amount')

  // --- Concurrency Tests ---

  // 11. Concurrent Issue
  const concurrentDoc = ok(await pm.from('billing_documents').insert({
    organization_id: organizationA,
    project_id: projectA,
    type: 'invoice_like',
    status: 'draft',
    date: '2030-01-01',
    currency: 'MXN',
    subtotal_amount: 1000,
    tax_amount: 160,
    total_amount: 1160
  }).select().single(), 'create draft doc for concurrent issue')

  ok(await pm.from('billing_document_items').insert({
    billing_document_id: concurrentDoc.id,
    description: 'Services',
    quantity: 1,
    unit_price: 1000,
    line_total: 1000
  }).select(), 'create items for concurrent doc')

  const concurrentIssueKey = randomUUID()
  await Promise.allSettled([
    director.rpc('issue_billing_document', { p_document_id: concurrentDoc.id, p_idempotency_key: concurrentIssueKey }),
    pm.rpc('issue_billing_document', { p_document_id: concurrentDoc.id, p_idempotency_key: concurrentIssueKey })
  ])

  const cDoc = ok(await pm.from('billing_documents').select('*').eq('id', concurrentDoc.id).single(), 'fetch concurrent doc')
  assert(cDoc.status === 'issued' && cDoc.number !== null, 'concurrent doc should be issued')
  const eventsOut = execSync(`docker exec supabase_db_omnia-craft psql -U postgres -d postgres -t -c "select count(*) from public.domain_events where resource_id = '${concurrentDoc.id}' and event_type = 'billing.document.issued';"`, { encoding: 'utf8', env: process.env })
  const eventsCount = parseInt(eventsOut.trim(), 10)
  assert(eventsCount === 1, 'there should be exactly one issued event for concurrent doc')

  // 12. Concurrent Payments
  const cpDoc = ok(await pm.from('billing_documents').insert({
    organization_id: organizationA,
    project_id: projectA,
    type: 'invoice_like',
    status: 'draft',
    date: '2030-01-01',
    currency: 'MXN',
    subtotal_amount: 20000,
    tax_amount: 0,
    total_amount: 20000
  }).select().single(), 'create draft doc for concurrent payment')

  ok(await pm.from('billing_document_items').insert({
    billing_document_id: cpDoc.id,
    description: 'Services',
    quantity: 1,
    unit_price: 20000,
    line_total: 20000
  }).select(), 'create items for concurrent payment doc')

  ok(await pm.rpc('issue_billing_document', { p_document_id: cpDoc.id, p_idempotency_key: randomUUID() }), 'issue cpDoc')

  const cpResult = await Promise.allSettled([
    directorSecond.rpc('record_payment', {
      p_document_id: cpDoc.id,
      p_amount: 7500,
      p_method: 'transfer',
      p_received_at: '2030-01-03T10:00:00Z',
      p_reference: 'REF_C1',
      p_notes: '',
      p_file_asset_id: null,
      p_idempotency_key: randomUUID()
    }),
    pm.rpc('record_payment', {
      p_document_id: cpDoc.id,
      p_amount: 12500,
      p_method: 'transfer',
      p_received_at: '2030-01-03T10:01:00Z',
      p_reference: 'REF_C2',
      p_notes: '',
      p_file_asset_id: null,
      p_idempotency_key: randomUUID()
    })
  ])
  assert(cpResult.every(result => result.status === 'fulfilled' && !result.value.error), 'both concurrent payments must succeed')
  
  const cpDocState = ok(await pm.from('billing_documents').select('status, total_amount').eq('id', cpDoc.id).single(), 'fetch cpDoc state')
  const cpPayments = ok(await pm.from('payment_records').select('amount').eq('billing_document_id', cpDoc.id).is('voided_at', null), 'fetch cp payments')
  const totalPaid = cpPayments.reduce((sum, p) => sum + p.amount, 0)
  assert(cpDocState.status === 'paid', 'cpDoc status should be paid (concurrent)')
  assert(totalPaid === 20000, 'cpDoc paid should be 20000 (concurrent)')
  assert(cpDocState.total_amount - totalPaid === 0, 'cpDoc remaining should be 0 (concurrent)')

  console.log('ok - all billing document flows tested (creation, issue, idempotency, freeze, partial payment, overpayment reject, full payment, void, publish, client projection, concurrent issue, concurrent payments)')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
