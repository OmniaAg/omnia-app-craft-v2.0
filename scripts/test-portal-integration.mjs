import { randomUUID } from 'node:crypto'
import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const ids = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  contributor: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local'],
  adminA: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
  reviewerA: ['10000000-0000-0000-0000-000000000006', 'client.reviewer.a@omnia.local'],
  viewerA: ['10000000-0000-0000-0000-000000000007', 'client.viewer.a@omnia.local'],
  viewerB: ['10000000-0000-0000-0000-000000000008', 'client.user.b@omnia.local'],
}
const projectA = '60000000-0000-0000-0000-0000000000a1'
const projectA3 = '60000000-0000-0000-0000-0000000000a3'
const projectB = '60000000-0000-0000-0000-0000000000b1'
const assert = (value, message) => { if (!value) throw new Error(message) }
const ok = (result, label) => {
  assert(!result.error && result.data !== null, `${label}: ${result.error?.message ?? 'missing result'}`)
  return result.data
}

function setSecondReviewerFixture(role) {
  assert(['client_viewer', 'client_reviewer'].includes(role), 'invalid fixture role')
  const sql = `update public.client_memberships set role_key='${role}' where user_id='${ids.viewerA[0]}' and organization_id='30000000-0000-0000-0000-00000000000a'`
  const output = execFileSync('docker', ['exec', 'supabase_db_omnia-craft', 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
  assert(output.includes('UPDATE 1'), 'fixture second reviewer setup failed')
}

async function main() {
  const { status } = await waitForPostgrest()
  assert(new URL(status.API_URL).hostname === '127.0.0.1', 'local API required')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  const login = async ([id, email], password) => {
    const secret = password ?? TEST_PASSWORD
    if (!password) ok(await admin.auth.admin.updateUserById(id, { password: secret, email_confirm: true }), `bootstrap ${email}`)
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } })
    const signed = await client.auth.signInWithPassword({ email, password: secret })
    assert(!signed.error, `login ${email}: ${signed.error?.message}`)
    return { client, password: secret }
  }
  const directorLogin = await login(ids.director)
  const director = directorLogin.client
  const pm = (await login(ids.pm)).client
  const contributor = (await login(ids.contributor)).client
  const reviewerLogin = await login(ids.reviewerA)
  const reviewer = reviewerLogin.client
  const reviewerRetry = (await login(ids.reviewerA, reviewerLogin.password)).client
  const viewer = (await login(ids.viewerA)).client
  const clientAdmin = (await login(ids.adminA)).client
  const foreign = (await login(ids.viewerB)).client
  console.log('ok - seven independent real Auth sessions')

  const initial = ok(await reviewer.rpc('portal_projects'), 'initial reviewer projects')
  assert(initial.some(row => row.project_id === projectA3) && !initial.some(row => row.project_id === projectA),
    'organization membership leaked unassigned A1')
  assert(ok(await clientAdmin.rpc('portal_projects'), 'admin projects').some(row => row.project_id === projectA),
    'admin missing assigned A1')
  assert((await clientAdmin.rpc('create_invitation', { kind: 'client', email: 'not-invited@omnia.local',
    organization_id: '30000000-0000-0000-0000-00000000000a', client_role_key: 'client_viewer',
    idempotency_key: randomUUID() })).error, 'client admin gained invitation authority')
  assert((await foreign.rpc('portal_project_detail', { project_id: projectA })).error,
    'foreign project detail accessible')
  for (const [user, member] of [[ids.reviewerA, reviewer], [ids.viewerA, viewer]]) {
    const existing = ok(await director.from('project_memberships').select('id').eq('project_id', projectA).eq('user_id', user[0]), 'membership lookup')
    if (!existing.length) ok(await director.rpc('add_project_member', {
      project_id: projectA, user_id: user[0], member_type: 'client', responsibility: 'client_member',
      idempotency_key: randomUUID(),
    }), 'explicit project assignment')
    assert(ok(await member.rpc('portal_projects'), 'assigned projects').some(row => row.project_id === projectA),
      'assigned client cannot see A1')
  }
  assert(!ok(await foreign.rpc('portal_projects'), 'foreign projects').some(row => row.project_id === projectA),
    'foreign organization sees A1')
  assert(!ok(await viewer.rpc('portal_projects'), 'viewer projects').some(row => row.project_id === projectA3),
    'same organization sees unassigned A3')
  console.log('ok - explicit memberships isolate same and foreign organizations')

  ok(await director.rpc('configure_review_requirements', { project_id: projectA, deliverable_id: null,
    reviewer_ids: [ids.director[0]], idempotency_key: randomUUID() }), 'internal reviewer requirement')
  const work = ok(await pm.rpc('create_work_item', { project_id: projectA,
    title: `Portal integration ${Date.now()}`, description: '', priority: 'normal', due_local: null,
    milestone_id: null, assignee_ids: [ids.contributor[0]], idempotency_key: randomUUID() }), 'new Work')
  const deliverable = ok(await contributor.rpc('create_deliverable', { work_item_id: work,
    title: 'Portal end-to-end delivery', idempotency_key: randomUUID() }), 'deliverable')
  const submit = async (notes, assets = []) => ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes, asset_ids: assets, idempotency_key: randomUUID(),
  }), 'submit version')
  const internalDecision = async (version, decision, reason = '') => {
    const detail = ok(await director.rpc('deliverable_detail', { work_item_id: work }), 'internal detail')
    const assignment = detail.versions.find(row => row.id === version)?.round.assignments.find(row => row.reviewer_id === ids.director[0])
    assert(assignment, 'internal assignment missing')
    ok(await director.rpc('record_review_decision', { review_assignment_id: assignment.id, decision,
      reason, idempotency_key: randomUUID() }), 'internal decision')
  }
  const v1 = await submit('Internal V1 only')
  await internalDecision(v1, 'request_changes', 'Revise first version')
  const pdf = new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'], { type: 'application/pdf' })
  const asset = ok(await contributor.rpc('prepare_file_asset', { project_id: projectA,
    original_filename: 'portal-v2.pdf', mime_type: pdf.type, size_bytes: pdf.size }), 'prepare PDF')
  ok(await contributor.storage.from(asset.bucket_id).upload(asset.object_path, pdf,
    { contentType: pdf.type, upsert: false }), 'private PDF upload')
  ok(await contributor.rpc('finalize_file_asset', { asset_id: asset.id }), 'finalize PDF')
  const v2 = await submit('Internal V2 with private PDF', [asset.id])
  await internalDecision(v2, 'approve')
  assert((await reviewer.storage.from(asset.bucket_id).download(asset.object_path)).error,
    'unpublished V2 file downloaded')
  const pubKey = randomUUID()
  ok(await director.rpc('publish_deliverable_to_client', { deliverable_id: deliverable,
    idempotency_key: pubKey }), 'publish V2')
  ok(await director.rpc('publish_deliverable_to_client', { deliverable_id: deliverable,
    idempotency_key: pubKey }), 'publish retry')
  const pending = ok(await reviewer.rpc('portal_approvals'), 'reviewer queue')
  const assignment = pending.find(row => row.deliverable_id === deliverable)
  assert(assignment?.version_number === 2, 'published approval is not V2')
  const approvalNotice = ok(await reviewer.from('notifications')
    .select('publication_id,work_item_id').eq('deliverable_id', deliverable)
    .eq('kind', 'approval_pending').single(), 'approval notification context')
  assert(approvalNotice.publication_id === assignment.publication_id && approvalNotice.work_item_id === work,
    'approval notification does not link to the published delivery')
  assert(!ok(await viewer.rpc('portal_approvals'), 'viewer queue').some(row => row.deliverable_id === deliverable),
    'viewer gained approval')
  assert((await viewer.rpc('record_client_decision', { assignment_id: assignment.assignment_id,
    decision: 'approve', reason: '', idempotency_key: randomUUID() })).error, 'viewer forged decision')
  assert((await foreign.rpc('record_client_decision', { assignment_id: assignment.assignment_id,
    decision: 'approve', reason: '', idempotency_key: randomUUID() })).error, 'foreign client forged decision')
  assert((await foreign.rpc('portal_deliverable_detail', { publication_id: assignment.publication_id })).error,
    'foreign publication UUID accessible')
  const shown = ok(await reviewer.rpc('portal_deliverable_detail', { publication_id: assignment.publication_id }), 'published detail')
  assert(shown.version_number === 2 && shown.files.length === 1 && shown.files[0].id === asset.id,
    'exact published V2 file snapshot missing')
  assert(!JSON.stringify(shown).includes('Internal V2'), 'internal notes leaked')
  ok(await reviewer.storage.from(asset.bucket_id).download(asset.object_path), 'authorized private PDF download')
  assert((await foreign.storage.from(asset.bucket_id).download(asset.object_path)).error, 'foreign path downloaded')
  const docs = ok(await viewer.rpc('portal_documents'), 'viewer documents')
  assert(docs.some(row => row.asset_id === asset.id), 'published document missing')
  assert((await contributor.rpc('submit_deliverable_version', { deliverable_id: deliverable,
    notes: 'Overlapping internal review', idempotency_key: randomUUID() })).error,
  'new internal version started while client review pending')
  ok(await reviewer.rpc('add_client_feedback', { publication_id: assignment.publication_id,
    body: 'Please refine the opening', idempotency_key: randomUUID() }), 'contextual feedback')
  const changesKey = randomUUID()
  const [change, changeRetry] = await Promise.all([
    reviewer.rpc('record_client_decision', { assignment_id: assignment.assignment_id,
      decision: 'request_changes', reason: 'Please refine the opening', idempotency_key: changesKey }),
    reviewerRetry.rpc('record_client_decision', { assignment_id: assignment.assignment_id,
      decision: 'request_changes', reason: 'Please refine the opening', idempotency_key: changesKey }),
  ])
  assert(ok(change, 'request changes') === ok(changeRetry, 'concurrent request retry'), 'decision retry duplicated')
  const changeNotice = ok(await pm.from('notifications')
    .select('publication_id,work_item_id').eq('deliverable_id', deliverable)
    .eq('kind', 'client_changes_requested').single(), 'change notification context')
  assert(changeNotice.publication_id === assignment.publication_id && changeNotice.work_item_id === work,
    'change notification does not link to the reviewed delivery')
  assert(ok(await director.rpc('deliverable_detail', { work_item_id: work }), 'changes state').deliverable.status === 'changes_requested',
    'agency cannot see changes state')
  console.log('ok - V1 internal changes, V2 publication, exact private file, feedback and retry-safe client changes')

  const v3 = await submit('Internal V3 after client feedback')
  await internalDecision(v3, 'approve')
  const beforeRepublish = ok(await reviewer.rpc('portal_deliverable_detail',
    { publication_id: assignment.publication_id }), 'V2 snapshot before V3 publication')
  assert(beforeRepublish.version_number === 2 && beforeRepublish.files[0]?.id === asset.id,
    'internal V3 changed the client V2 snapshot')
  assert(!ok(await reviewer.rpc('portal_approvals'), 'queue before V3 publication')
    .some(row => row.deliverable_id === deliverable), 'internal V3 appeared before publication')
  ok(await director.rpc('publish_deliverable_to_client', { deliverable_id: deliverable,
    idempotency_key: randomUUID() }), 'publish V3')
  const next = ok(await reviewer.rpc('portal_approvals'), 'V3 queue').find(row => row.deliverable_id === deliverable)
  assert(next?.version_number === 3 && next.publication_id !== assignment.publication_id, 'V3 publication did not supersede V2')
  assert((await reviewer.rpc('record_client_decision', { assignment_id: assignment.assignment_id,
    decision: 'approve', reason: '', idempotency_key: randomUUID() })).error, 'old review accepted decision')
  ok(await reviewer.rpc('record_client_decision', { assignment_id: next.assignment_id,
    decision: 'approve', reason: '', idempotency_key: randomUUID() }), 'approve V3')
  const final = ok(await director.rpc('deliverable_detail', { work_item_id: work }), 'final agency state')
  assert(final.deliverable.status === 'client_approved' && final.versions.length === 3, 'final state/history incorrect')
  const history = ok(await director.rpc('internal_client_review_history', { work_item_id: work }), 'agency client history')
  assert(history.length === 2 && history.some(row => row.review_status === 'changes_requested')
    && history.some(row => row.review_status === 'approved'), 'client decision history missing')
  assert(!ok(await reviewer.rpc('portal_approvals'), 'final approvals').some(row => row.deliverable_id === deliverable),
    'approved item remains pending')
  assert(!(await reviewer.from('review_decisions').select('id')).data?.length, 'internal decisions exposed')
  assert(!(await reviewer.from('work_items').select('id')).data?.length, 'internal Work exposed')
  assert(!(await reviewer.from('editorial_items').select('id')).data?.length, 'internal Editorial exposed')
  assert(!(await reviewer.from('opportunities').select('id')).data?.length, 'CRM exposed')
  assert(ok(await reviewer.rpc('portal_projects'), 'post-flow projects').every(row => row.project_id !== projectB),
    'foreign Project exposed')
  console.log('ok - V3 approved; agency sees immutable V1/V2/V3 and client review history; internal domains denied')

  setSecondReviewerFixture('client_reviewer')
  const publishForRace = async (label) => {
    const raceWork = ok(await pm.rpc('create_work_item', { project_id: projectA,
      title: `${label} ${Date.now()}`, description: '', priority: 'normal', due_local: null,
      milestone_id: null, assignee_ids: [ids.contributor[0]], idempotency_key: randomUUID() }), 'race Work')
    const raceDeliverable = ok(await contributor.rpc('create_deliverable', { work_item_id: raceWork,
      title: label, idempotency_key: randomUUID() }), 'race deliverable')
    const raceVersion = ok(await contributor.rpc('submit_deliverable_version', { deliverable_id: raceDeliverable,
      notes: label, idempotency_key: randomUUID() }), 'race submission')
    const raceDetail = ok(await director.rpc('deliverable_detail', { work_item_id: raceWork }), 'race internal detail')
    const internalAssignment = raceDetail.versions.find(row => row.id === raceVersion).round.assignments[0]
    ok(await director.rpc('record_review_decision', { review_assignment_id: internalAssignment.id,
      decision: 'approve', reason: '', idempotency_key: randomUUID() }), 'race internal approval')
    ok(await director.rpc('publish_deliverable_to_client', { deliverable_id: raceDeliverable,
      idempotency_key: randomUUID() }), 'race publication')
    const first = ok(await reviewer.rpc('portal_approvals'), 'first reviewer queue').find(row => row.deliverable_id === raceDeliverable)
    const second = ok(await viewer.rpc('portal_approvals'), 'second reviewer queue').find(row => row.deliverable_id === raceDeliverable)
    assert(first && second && first.assignment_id !== second.assignment_id, 'two client assignments missing')
    return { raceWork, raceDeliverable, first, second }
  }
  const both = await publishForRace('Two client approvals')
  const twoApprovals = await Promise.all([
    reviewer.rpc('record_client_decision', { assignment_id: both.first.assignment_id,
      decision: 'approve', reason: '', idempotency_key: randomUUID() }),
    viewer.rpc('record_client_decision', { assignment_id: both.second.assignment_id,
      decision: 'approve', reason: '', idempotency_key: randomUUID() }),
  ])
  twoApprovals.forEach((result, index) => ok(result, `concurrent client approval ${index + 1}`))
  assert(ok(await director.rpc('deliverable_detail', { work_item_id: both.raceWork }), 'two-reviewer outcome')
    .deliverable.status === 'client_approved', 'concurrent approvals did not close review')
  const mixed = await publishForRace('Approve versus changes')
  const mixedDecisions = await Promise.all([
    reviewer.rpc('record_client_decision', { assignment_id: mixed.first.assignment_id,
      decision: 'approve', reason: '', idempotency_key: randomUUID() }),
    viewer.rpc('record_client_decision', { assignment_id: mixed.second.assignment_id,
      decision: 'request_changes', reason: 'Concurrent change request', idempotency_key: randomUUID() }),
  ])
  ok(mixedDecisions[1], 'concurrent request changes')
  assert(!mixedDecisions[0].error || mixedDecisions[0].error.message.includes('client_review_closed'),
    'unexpected concurrent approval error')
  assert(ok(await director.rpc('deliverable_detail', { work_item_id: mixed.raceWork }), 'mixed outcome')
    .deliverable.status === 'changes_requested', 'request changes lost to concurrent approval')
  setSecondReviewerFixture('client_viewer')
  console.log('ok - two reviewer approvals and approve-versus-changes serialize coherently')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
