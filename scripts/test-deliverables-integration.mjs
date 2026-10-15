import { randomUUID } from 'node:crypto'
import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const users = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pmBasic: ['10000000-0000-0000-0000-000000000002', 'pm.basic@omnia.local'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  contributor: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local'],
  client: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
  clientReviewer: ['10000000-0000-0000-0000-000000000006', 'client.reviewer.a@omnia.local'],
}
const projectA = '60000000-0000-0000-0000-0000000000a1'
const workA = process.env.OMNIA_QA_WORK_ITEM ?? '63000000-0000-0000-0000-0000000000a1'
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
  const directorLogin = await actor(users.director)
  const director = directorLogin.client
  const directorSecond = (await actor(users.director, directorLogin.password)).client
  const pmLogin = await actor(users.pm)
  const pm = pmLogin.client
  const pmSecond = (await actor(users.pm, pmLogin.password)).client
  const pmBasic = (await actor(users.pmBasic)).client
  const contributorLogin = await actor(users.contributor)
  const contributor = contributorLogin.client
  const contributorSecond = (await actor(users.contributor, contributorLogin.password)).client
  const client = (await actor(users.client)).client
  console.log('ok - local actors authenticated in independent sessions')

  const configKey = randomUUID()
  const reviewers = [users.pm[0], users.director[0]]
  ok(await director.rpc('configure_review_requirements', {
    project_id: projectA, deliverable_id: null, reviewer_ids: reviewers, idempotency_key: configKey,
  }), 'director configures two reviewers')
  ok(await director.rpc('configure_review_requirements', {
    project_id: projectA, deliverable_id: null, reviewer_ids: reviewers, idempotency_key: configKey,
  }), 'configuration retry')
  const config = ok(await director.rpc('review_configuration', { project_id: projectA }), 'configuration read')
  assert(config.requirements.length === 2, 'two project requirements expected')
  ok(await pm.rpc('configure_review_requirements', {
    project_id: projectA, deliverable_id: null, reviewer_ids: reviewers, idempotency_key: randomUUID(),
  }), 'scoped PM configures Project A')
  const unauthorizedConfig = await pmBasic.rpc('configure_review_requirements', {
    project_id: projectA, deliverable_id: null, reviewer_ids: [users.pm[0]], idempotency_key: randomUUID(),
  })
  assert(unauthorizedConfig.error, 'PM without review.configure must be denied')
  assert((await pm.rpc('configure_review_requirements', {
    project_id: '60000000-0000-0000-0000-0000000000b1', deliverable_id: null,
    reviewer_ids: [users.pmBasic[0]], idempotency_key: randomUUID(),
  })).error, 'scoped PM cannot configure Project B')
  const crossConfig = await director.rpc('configure_review_requirements', {
    project_id: projectA, deliverable_id: null, reviewer_ids: [users.client[0]], idempotency_key: randomUUID(),
  })
  assert(crossConfig.error, 'client cannot be configured as internal reviewer')
  console.log('ok - configurable requirements, retry, PM restriction and client exclusion')

  const createKey = randomUUID()
  const deliverable = ok(await contributor.rpc('create_deliverable', {
    work_item_id: workA, title: 'Phase 7 integration delivery', idempotency_key: createKey,
  }), 'contributor creates deliverable')
  assert(ok(await contributor.rpc('create_deliverable', {
    work_item_id: workA, title: 'Phase 7 integration delivery', idempotency_key: createKey,
  }), 'create retry') === deliverable, 'create retry changed id')
  const wrongProjectCreate = await contributor.rpc('create_deliverable', {
    work_item_id: '63000000-0000-0000-0000-0000000000b1', title: 'Forbidden', idempotency_key: randomUUID(),
  })
  assert(wrongProjectCreate.error, 'cross project create must fail')
  const submitKey = randomUUID()
  const [first, retry] = await Promise.all([
    contributor.rpc('submit_deliverable_version', { deliverable_id: deliverable, notes: 'First internal draft', idempotency_key: submitKey }),
    contributorSecond.rpc('submit_deliverable_version', { deliverable_id: deliverable, notes: 'First internal draft', idempotency_key: submitKey }),
  ])
  const v1 = ok(first, 'submit V1')
  assert(ok(retry, 'concurrent submit retry') === v1, 'concurrent retry created another version')
  let detail = ok(await contributor.rpc('deliverable_detail', { work_item_id: workA }), 'deliverable detail V1')
  assert(detail.versions.length === 1 && detail.versions[0].version_number === 1
    && detail.versions[0].round.assignments.length === 2, 'V1 snapshot incomplete')
  const a1 = detail.versions[0].round.assignments.find((row) => row.reviewer_id === users.pm[0])
  const a2 = detail.versions[0].round.assignments.find((row) => row.reviewer_id === users.director[0])
  assert(a1 && a2, 'expected reviewer assignments')
  const queuePm = ok(await pm.rpc('review_queue'), 'PM queue')
  assert(queuePm.some((row) => row.assignment_id === a1.id), 'PM queue missing own assignment')
  assert(!queuePm.some((row) => row.assignment_id === a2.id), 'PM queue leaked director assignment')
  assert(!(await client.rpc('review_queue')).data, 'client queue unexpectedly returned')
  assert(!(await client.from('review_assignments').select('id')).data?.length, 'client read internal assignments')
  console.log('ok - V1 single version, two assignments, scoped queue and client denial')

  const decisionKey = randomUUID()
  const [approve, approveRetry] = await Promise.all([
    pm.rpc('record_review_decision', { review_assignment_id: a1.id, decision: 'approve', reason: '', idempotency_key: decisionKey }),
    pmSecond.rpc('record_review_decision', { review_assignment_id: a1.id, decision: 'approve', reason: '', idempotency_key: decisionKey }),
  ])
  assert(ok(approve, 'PM approves') === ok(approveRetry, 'PM decision retry'), 'double decision created different rows')
  assert((await contributor.rpc('record_review_decision', {
    review_assignment_id: a2.id, decision: 'approve', reason: '', idempotency_key: randomUUID(),
  })).error, 'contributor forged reviewer decision')
  ok(await director.rpc('record_review_decision', {
    review_assignment_id: a2.id, decision: 'request_changes', reason: 'Revise hierarchy', idempotency_key: randomUUID(),
  }), 'director requests changes')
  detail = ok(await contributor.rpc('deliverable_detail', { work_item_id: workA }), 'post changes detail')
  assert(detail.deliverable.status === 'changes_requested' && detail.versions[0].round.status === 'changes_requested', 'changes outcome wrong')
  assert(detail.work.status === 'in_progress', 'Work did not return to execution')
  const v2Key = randomUUID()
  const v2 = ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'Second draft after changes', idempotency_key: v2Key,
  }), 'submit V2')
  detail = ok(await contributor.rpc('deliverable_detail', { work_item_id: workA }), 'V2 detail')
  assert(detail.versions.length === 2 && detail.versions[0].id === v2
    && detail.versions[0].version_number === 2 && detail.versions[1].id === v1
    && detail.versions[1].round.status === 'changes_requested', 'version history lost')
  const v2Pm = detail.versions[0].round.assignments.find((row) => row.reviewer_id === users.pm[0])
  const v2Director = detail.versions[0].round.assignments.find((row) => row.reviewer_id === users.director[0])
  const [decisionPm, decisionDirector] = await Promise.all([
    pm.rpc('record_review_decision', { review_assignment_id: v2Pm.id, decision: 'approve', reason: '', idempotency_key: randomUUID() }),
    director.rpc('record_review_decision', { review_assignment_id: v2Director.id, decision: 'approve', reason: '', idempotency_key: randomUUID() }),
  ])
  ok(decisionPm, 'PM concurrent V2 decision')
  ok(decisionDirector, 'director concurrent V2 decision')
  detail = ok(await contributor.rpc('deliverable_detail', { work_item_id: workA }), 'approved detail')
  assert(detail.versions[0].round.status === 'approved' && detail.deliverable.status === 'ready_for_client'
    && detail.work.status === 'done', 'all-reviewer approval incorrect')
  assert(ok(await contributorSecond.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'Second draft after changes', idempotency_key: v2Key,
  }), 'late submit retry') === v2, 'late retry after approval created or rejected V2')
  assert(ok(await contributor.rpc('create_deliverable', {
    work_item_id: workA, title: 'Phase 7 integration delivery', idempotency_key: createKey,
  }), 'late create retry') === deliverable, 'late create retry failed after Work completion')
  assert((await contributor.from('review_decisions').update({ decision: 'request_changes' }).eq('review_assignment_id', v2Pm.id)).error,
    'direct decision mutation allowed')
  assert((await contributor.from('deliverables').update({ status: 'ready_for_client' }).eq('id', deliverable)).error,
    'direct deliverable mutation allowed')
  console.log('ok - retry decision, changes, immutable V1, V2 concurrent approvals and direct mutation denial')

  const newWork = async (title) => ok(await pm.rpc('create_work_item', {
    project_id: projectA, title, description: '', priority: 'normal', due_local: null,
    milestone_id: null, assignee_ids: [users.contributor[0]], idempotency_key: randomUUID(),
  }), 'new Work')
  const overrideWork = await newWork(`Override integration ${Date.now()}`)
  const overrideDeliverable = ok(await contributor.rpc('create_deliverable', {
    work_item_id: overrideWork, title: 'Override path', idempotency_key: randomUUID(),
  }), 'override deliverable')
  ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: overrideDeliverable, notes: 'Version for override', idempotency_key: randomUUID(),
  }), 'override submission')
  const overrideDetail = ok(await contributor.rpc('deliverable_detail', { work_item_id: overrideWork }), 'override detail')
  const overridePm = overrideDetail.versions[0].round.assignments.find((row) => row.reviewer_id === users.pm[0])
  const overrideDirector = overrideDetail.versions[0].round.assignments.find((row) => row.reviewer_id === users.director[0])
  ok(await director.rpc('record_review_decision', {
    review_assignment_id: overrideDirector.id, decision: 'approve', reason: '', idempotency_key: randomUUID(),
  }), 'director approval before override')
  assert((await pm.rpc('override_review_requirement', {
    review_assignment_id: overridePm.id, reason: 'Unavailable', idempotency_key: randomUUID(),
  })).error, 'PM override allowed')
  assert((await director.rpc('override_review_requirement', {
    review_assignment_id: overridePm.id, reason: '', idempotency_key: randomUUID(),
  })).error, 'blank override reason allowed')
  const overrideKey = randomUUID()
  const overrideId = ok(await director.rpc('override_review_requirement', {
    review_assignment_id: overridePm.id, reason: 'Reviewer unavailable during release', idempotency_key: overrideKey,
  }), 'director override')
  assert(ok(await directorSecond.rpc('override_review_requirement', {
    review_assignment_id: overridePm.id, reason: 'Reviewer unavailable during release', idempotency_key: overrideKey,
  }), 'override retry') === overrideId, 'override retry changed id')
  const overrideHistory = ok(await contributor.rpc('deliverable_detail', { work_item_id: overrideWork }), 'override history')
  assert(overrideHistory.versions[0].round.status === 'approved'
    && overrideHistory.versions[0].round.assignments.find((row) => row.id === overridePm.id).status === 'overridden',
  'override outcome or evidence wrong')
  const { data: evidence, error: evidenceError } = await director.from('review_overrides').select('audit_event_id,reason,requirement_id,reviewer_id,deliverable_version_id').eq('id', overrideId).single()
  assert(evidence?.audit_event_id && evidence.reviewer_id === users.pm[0], `override audit evidence missing: ${evidenceError?.message ?? JSON.stringify(evidence)}`)
  console.log('ok - director-only override, mandatory reason, retry and audit evidence')

  const raceWork = await newWork(`Submission race ${Date.now()}`)
  const raceDeliverable = ok(await contributor.rpc('create_deliverable', {
    work_item_id: raceWork, title: 'Submission race', idempotency_key: randomUUID(),
  }), 'race deliverable')
  const race = await Promise.all([
    contributor.rpc('submit_deliverable_version', { deliverable_id: raceDeliverable, notes: 'Candidate A', idempotency_key: randomUUID() }),
    contributorSecond.rpc('submit_deliverable_version', { deliverable_id: raceDeliverable, notes: 'Candidate B', idempotency_key: randomUUID() }),
  ])
  assert(race.filter((item) => !item.error).length === 1, 'two competing submissions both won')
  const raceDetail = ok(await contributor.rpc('deliverable_detail', { work_item_id: raceWork }), 'race detail')
  assert(raceDetail.versions.length === 1 && raceDetail.versions[0].version_number === 1
    && raceDetail.versions[0].round.assignments.length === 2, 'submission race left duplicate or orphan')
  const changesWork = await newWork(`Decision race ${Date.now()}`)
  const changesDeliverable = ok(await contributor.rpc('create_deliverable', {
    work_item_id: changesWork, title: 'Decision race', idempotency_key: randomUUID(),
  }), 'decision race deliverable')
  ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: changesDeliverable, notes: 'Version for decision race', idempotency_key: randomUUID(),
  }), 'decision race submission')
  const changesDetail = ok(await contributor.rpc('deliverable_detail', { work_item_id: changesWork }), 'decision race detail')
  const changesPm = changesDetail.versions[0].round.assignments.find((row) => row.reviewer_id === users.pm[0])
  const changesDirector = changesDetail.versions[0].round.assignments.find((row) => row.reviewer_id === users.director[0])
  const [requestRace, approveRace] = await Promise.all([
    pm.rpc('record_review_decision', { review_assignment_id: changesPm.id, decision: 'request_changes', reason: 'Concurrent changes', idempotency_key: randomUUID() }),
    directorSecond.rpc('record_review_decision', { review_assignment_id: changesDirector.id, decision: 'approve', reason: '', idempotency_key: randomUUID() }),
  ])
  ok(requestRace, 'concurrent request changes')
  assert(!approveRace.error || approveRace.error.message.includes('review_round_closed'), 'unexpected concurrent approval error')
  const changesResult = ok(await contributor.rpc('deliverable_detail', { work_item_id: changesWork }), 'decision race outcome')
  assert(changesResult.versions[0].round.status === 'changes_requested', 'request changes lost to concurrent approval')
  const racePm = raceDetail.versions[0].round.assignments.find((row) => row.reviewer_id === users.pm[0])
  const [overrideRace, decisionRace] = await Promise.all([
    director.rpc('override_review_requirement', { review_assignment_id: racePm.id, reason: 'Concurrent exception', idempotency_key: randomUUID() }),
    pm.rpc('record_review_decision', { review_assignment_id: racePm.id, decision: 'approve', reason: '', idempotency_key: randomUUID() }),
  ])
  assert(Number(!overrideRace.error) + Number(!decisionRace.error) === 1, 'override vs decision lacked one winner')
  const { data: finalAssignments } = await director.from('review_assignments').select('status').eq('id', racePm.id)
  assert(finalAssignments?.length === 1 && ['approved', 'overridden'].includes(finalAssignments[0].status), 'race corrupted assignment')
  console.log('ok - competing version submission and override vs decision serialize coherently')

  ok(await director.rpc('add_project_member', {
    project_id: projectA, user_id: users.clientReviewer[0], member_type: 'client',
    responsibility: 'client_member', idempotency_key: randomUUID(),
  }), 'assign client reviewer before publication')
  ok(await director.rpc('publish_deliverable_to_client', { deliverable_id: deliverable, idempotency_key: randomUUID() }), 'publish')
  assert(!(await client.from('deliverables').select('id').eq('id', deliverable)).data?.length, 'client sees internal deliverable')
  assert((await pm.rpc('record_review_decision', {
    review_assignment_id: v2Director.id, decision: 'approve', reason: '', idempotency_key: randomUUID(),
  })).error, 'PM could decide for another assignment')
  assert((await pm.rpc('create_deliverable', {
    work_item_id: '63000000-0000-0000-0000-0000000000b1', title: 'PM B attack', idempotency_key: randomUUID(),
  })).error, 'PM A crossed to Project B')
  console.log('ok - publication remains server-side; client and PM cross-project isolation')

  const template = ok(await pm.rpc('create_content_template', {
    project_id: projectA, name: 'Review editorial template', default_channel: 'instagram',
    default_format: 'post', default_brief: 'Canonical Work output',
  }), 'editorial template')
  const cycle = ok(await pm.rpc('create_editorial_cycle', {
    project_id: projectA, name: 'Review editorial cycle', start_date: '2030-10-01', end_date: '2030-10-31',
  }), 'editorial cycle')
  const item = ok(await pm.rpc('create_editorial_item', {
    project_id: projectA, cycle_id: cycle, template_id: template, title: 'Reviewed editorial item',
    brief: '', scheduled_date: '2030-10-20', scheduled_time: null, channel: null, format: null,
    idempotency_key: randomUUID(),
  }), 'editorial item')
  const { data: editorialRow, error: editorialError } = await pm.from('editorial_items').select('work_item_id,project_id').eq('id', item).single()
  assert(!editorialError && editorialRow.project_id === projectA, 'editorial canonical Work missing')
  ok(await pm.rpc('assign_work_item', {
    work_item_id: editorialRow.work_item_id, assignee_ids: [users.contributor[0]], idempotency_key: randomUUID(),
  }), 'assign editorial Work')
  const editorialDeliverable = ok(await contributor.rpc('create_deliverable', {
    work_item_id: editorialRow.work_item_id, title: 'Editorial delivery', idempotency_key: randomUUID(),
  }), 'editorial deliverable')
  ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: editorialDeliverable, notes: 'Editorial version for internal review', idempotency_key: randomUUID(),
  }), 'editorial version')
  const editorialDetail = ok(await contributor.rpc('deliverable_detail', { work_item_id: editorialRow.work_item_id }), 'editorial delivery detail')
  assert(editorialDetail.versions.length === 1 && editorialDetail.work.project_id === projectA,
    'Editorial → Work → Deliverable relation incoherent')
  console.log('ok - Editorial item produces reviewed Deliverable through canonical Work')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
