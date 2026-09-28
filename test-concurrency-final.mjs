import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './scripts/lib/local-supabase.mjs'
import { execSync } from 'node:child_process'
import { TEST_PASSWORD } from './scripts/test-fixtures/credentials.mjs'

const users = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
}
const organizationA = '30000000-0000-0000-0000-00000000000a'
const projectA = '60000000-0000-0000-0000-0000000000a1'

async function main() {
  const { status } = await waitForPostgrest()
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  
  async function getClient([id, email]) {
    await admin.auth.admin.updateUserById(id, { password: TEST_PASSWORD, email_confirm: true })
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
    return client
  }

  const sessionA = await getClient(users.director)
  const sessionB = await getClient(users.pm)

  console.log('# Phase 11 Concurrency Final Check\n')

  // --- 1. Concurrent issue ---
  const docIssueRes = await sessionA.from('billing_documents').insert({
    organization_id: organizationA,
    project_id: projectA,
    type: 'invoice_like',
    status: 'draft',
    date: '2030-01-01',
    currency: 'MXN',
    subtotal_amount: 1000,
    tax_amount: 160,
    total_amount: 1160
  }).select().single()
  const docIssueId = docIssueRes.data.id

  await sessionA.from('billing_document_items').insert({
    billing_document_id: docIssueId,
    description: 'Services',
    quantity: 1,
    unit_price: 1000,
    line_total: 1000
  })

  // We do NOT use idempotency key here to test true database row locking for concurrent issue,
  // or we can use different keys to bypass idempotency check and hit the row lock.
  // The requirements just say: "Session A -> issue(draft X), Session B -> issue(draft X)"
  const [resIA, resIB] = await Promise.all([
    sessionA.rpc('issue_billing_document', { p_document_id: docIssueId, p_idempotency_key: null }),
    sessionB.rpc('issue_billing_document', { p_document_id: docIssueId, p_idempotency_key: null })
  ])

  const docIssueState = (await sessionA.from('billing_documents').select('*').eq('id', docIssueId).single()).data
  const eventsOut = execSync(`docker exec supabase_db_omnia-craft psql -U postgres -d postgres -t -c "select count(*) from public.domain_events where resource_id = '${docIssueId}' and event_type = 'billing.document.issued';"`, { encoding: 'utf8', env: process.env })
  const issueEvents = parseInt(eventsOut.trim(), 10)

  const issuePass = (resIA.error ? false : true) !== (resIB.error ? false : true) && docIssueState.status === 'issued' && issueEvents === 1
  console.log('## Concurrent issue')
  console.log(issuePass ? 'PASS' : 'FAIL')
  console.log(`- Session A: ${resIA.error ? resIA.error.message : 'SUCCESS'}`)
  console.log(`- Session B: ${resIB.error ? resIB.error.message : 'SUCCESS'}`)
  console.log(`- final document number: ${docIssueState.number}`)
  console.log(`- issue events: ${issueEvents}`)
  console.log(`- final state: ${docIssueState.status}\n`)

  // --- 2. Concurrent payments ---
  const docPayRes = await sessionA.from('billing_documents').insert({
    organization_id: organizationA,
    project_id: projectA,
    type: 'invoice_like',
    status: 'draft',
    date: '2030-01-01',
    currency: 'MXN',
    subtotal_amount: 20000,
    tax_amount: 0,
    total_amount: 20000
  }).select().single()
  const docPayId = docPayRes.data.id

  await sessionA.from('billing_document_items').insert({
    billing_document_id: docPayId,
    description: 'Services',
    quantity: 1,
    unit_price: 20000,
    line_total: 20000
  })

  await sessionA.rpc('issue_billing_document', { p_document_id: docPayId, p_idempotency_key: null })

  const [resPA, resPB] = await Promise.all([
    sessionA.rpc('record_payment', {
      p_document_id: docPayId,
      p_amount: 7500,
      p_method: 'transfer',
      p_received_at: '2030-01-03T10:00:00Z',
      p_reference: 'REF_C1',
      p_notes: '',
      p_file_asset_id: null,
      p_idempotency_key: randomUUID()
    }),
    sessionB.rpc('record_payment', {
      p_document_id: docPayId,
      p_amount: 12500,
      p_method: 'transfer',
      p_received_at: '2030-01-03T10:01:00Z',
      p_reference: 'REF_C2',
      p_notes: '',
      p_file_asset_id: null,
      p_idempotency_key: randomUUID()
    })
  ])

  const docPayState = (await sessionA.from('billing_documents').select('status, total_amount').eq('id', docPayId).single()).data
  const payments = (await sessionA.from('payment_records').select('amount').eq('billing_document_id', docPayId).is('voided_at', null)).data
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = docPayState.total_amount - totalPaid

  const payPass = !resPA.error && !resPB.error && totalPaid === 20000 && remaining === 0 && docPayState.status === 'paid'
  console.log('## Concurrent payments')
  console.log(payPass ? 'PASS' : 'FAIL')
  console.log(`- Session A: ${resPA.error ? resPA.error.message : 'SUCCESS'}`)
  console.log(`- Session B: ${resPB.error ? resPB.error.message : 'SUCCESS'}`)
  console.log(`- payment records: ${payments.length}`)
  console.log(`- paid: ${totalPaid.toLocaleString('en-US', {minimumFractionDigits: 0})}`)
  console.log(`- remaining: ${remaining.toLocaleString('en-US', {minimumFractionDigits: 0})}`)
  console.log(`- final state: ${docPayState.status}\n`)

  console.log('## Final')
  console.log(`Phase 11 concurrency: ${issuePass && payPass ? 'PASS' : 'FAIL'}`)
  console.log(`Phase 12 readiness: ${issuePass && payPass ? 'READY' : 'NOT READY'}`)

  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
