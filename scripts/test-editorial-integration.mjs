import { randomUUID } from 'node:crypto'
import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const users = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  a: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local'],
  b: ['10000000-0000-0000-0000-000000000011', 'contributor.b@omnia.local'],
  client: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
}
const projectA = '60000000-0000-0000-0000-0000000000a1'
const projectB = '60000000-0000-0000-0000-0000000000b1'
const invariant = (condition, message) => { if (!condition) throw new Error(message) }

async function main() {
  const { status } = await waitForPostgrest()
  invariant(new URL(status.API_URL).hostname === '127.0.0.1', 'local loopback API required')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  async function actor([id, email], password) {
    const secret = password ?? TEST_PASSWORD
    if (!password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password: secret, email_confirm: true })
      invariant(!error, `password bootstrap failed for ${email}`)
    }
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await client.auth.signInWithPassword({ email, password: secret })
    invariant(!error, `login failed for ${email}: ${error?.message}`)
    return { client, password: secret }
  }
  const director = (await actor(users.director)).client
  const pmLogin = await actor(users.pm)
  const pm = pmLogin.client
  const pmSecond = (await actor(users.pm, pmLogin.password)).client
  const aLogin = await actor(users.a)
  const a = aLogin.client
  const aSecond = (await actor(users.a, aLogin.password)).client
  const b = (await actor(users.b)).client
  const client = (await actor(users.client)).client
  console.log('ok - PM sessions, contributors and client logged in locally')

  const { data: existingMember, error: memberReadError } = await director.from('project_memberships').select('id').eq('project_id', projectA).eq('user_id', users.b[0]).eq('status', 'active')
  invariant(!memberReadError, `second contributor membership lookup failed: ${memberReadError?.message}`)
  if (!existingMember.length) {
    const { error: memberError } = await director.rpc('add_project_member', { project_id: projectA, user_id: users.b[0], member_type: 'internal', responsibility: 'member', idempotency_key: randomUUID() })
    invariant(!memberError, `second contributor membership failed: ${memberError?.message}`)
  }
  const { data: template, error: templateError } = await pm.rpc('create_content_template', { project_id: projectA, name: 'Social brief', default_channel: 'instagram', default_format: 'carousel', default_brief: 'Produce three editorial frames.' })
  invariant(!templateError && template, `template create failed: ${templateError?.message}`)
  const { data: cycle, error: cycleError } = await pm.rpc('create_editorial_cycle', { project_id: projectA, name: 'October planning', start_date: '2030-10-01', end_date: '2030-11-10' })
  invariant(!cycleError && cycle, `cycle create failed: ${cycleError?.message}`)
  const { error: editCycleError } = await pm.rpc('update_editorial_cycle', { cycle_id: cycle, name: 'October and November planning', start_date: '2030-10-01', end_date: '2030-11-10', status: 'open' })
  invariant(!editCycleError, `cycle edit failed: ${editCycleError?.message}`)
  const { error: editTemplateError } = await pm.rpc('update_content_template', { template_id: template, name: 'Social brief v2', default_channel: 'instagram', default_format: 'carousel', default_brief: 'Produce four editorial frames.', archive: false })
  invariant(!editTemplateError, `template edit failed: ${editTemplateError?.message}`)
  console.log('ok - PM created cycle and edited scoped template')

  async function newPiece(title, date = '2030-10-31') {
    const { data: item, error } = await pm.rpc('create_editorial_item', { project_id: projectA, cycle_id: cycle, template_id: template, title, brief: '', scheduled_date: date, scheduled_time: null, channel: null, format: null, idempotency_key: randomUUID() })
    invariant(!error && item, `editorial item create failed: ${error?.message}`)
    return item
  }
  const item = await newPiece(`Editorial integration ${Date.now()}`)
  const { data: workRows, error: calendarError } = await pm.rpc('editorial_calendar', { date_from: '2030-10-01', date_to: '2030-10-31', project_filter: projectA })
  invariant(!calendarError, `calendar failed: ${calendarError?.message}`)
  const row = workRows.find((entry) => entry.item_id === item)
  invariant(row && row.channel === 'instagram' && row.format === 'carousel' && row.brief === 'Produce four editorial frames.', 'template defaults did not reach editorial item')
  const { data: canonicalWork, error: workError } = await pm.from('work_items').select('id,project_id,title').eq('id', row.work_item_id).single()
  invariant(!workError && canonicalWork.project_id === projectA, 'canonical Work relationship missing')
  const { error: publishError } = await pm.rpc('publish_editorial_available', { item_id: item })
  invariant(!publishError, `publish available failed: ${publishError?.message}`)
  console.log('ok - template produced atomic Editorial + Work and PM published availability')

  const { data: contributorView, error: contributorViewError } = await a.rpc('editorial_calendar', { date_from: '2030-10-01', date_to: '2030-10-31', project_filter: projectA })
  invariant(!contributorViewError && contributorView.some((entry) => entry.item_id === item && entry.can_apply), 'eligible contributor cannot see available work')
  const [{ data: applicationA, error: applyAError }, { data: duplicateA, error: duplicateAError }, { data: applicationB, error: applyBError }] = await Promise.all([
    a.rpc('apply_to_editorial_work', { item_id: item }), aSecond.rpc('apply_to_editorial_work', { item_id: item }), b.rpc('apply_to_editorial_work', { item_id: item }),
  ])
  invariant(!applyAError && !duplicateAError && !applyBError && applicationA && duplicateA === applicationA && applicationB, `concurrent apply failed: ${applyAError?.message ?? duplicateAError?.message ?? applyBError?.message}`)
  const { data: retry, error: retryError } = await a.rpc('apply_to_editorial_work', { item_id: item })
  invariant(!retryError && retry === applicationA, 'application retry was not idempotent')
  const { data: applicants, error: applicantsError } = await pm.rpc('editorial_applications', { item_id: item })
  invariant(!applicantsError && applicants.length === 2, 'PM did not see two applicants')
  const { error: acceptError } = await pm.rpc('accept_editorial_application', { application_id: applicationA })
  invariant(!acceptError, `accept failed: ${acceptError?.message}`)
  const { data: resolved } = await pm.rpc('editorial_applications', { item_id: item })
  invariant(resolved.find((entry) => entry.application_id === applicationA)?.status === 'accepted' && resolved.find((entry) => entry.application_id === applicationB)?.status === 'rejected', 'applications were not resolved coherently')
  const { data: space } = await a.rpc('my_space_items')
  invariant(space.some((entry) => entry.item_id === row.work_item_id), 'accepted Work Item did not appear in My Space')
  const { data: assignees } = await pm.from('work_item_assignees').select('user_id').eq('work_item_id', row.work_item_id).is('revoked_at', null)
  invariant(assignees.length === 1 && assignees[0].user_id === users.a[0], 'canonical Work assignee mismatch')
  console.log('ok - A and B applied; PM accepted A; B resolved; Work and My Space agree')

  const competing = await newPiece(`Concurrent editorial ${Date.now()}`, '2030-11-01')
  invariant(!(await pm.rpc('publish_editorial_available', { item_id: competing })).error, 'second publish failed')
  const [compA, compB] = await Promise.all([a.rpc('apply_to_editorial_work', { item_id: competing }), b.rpc('apply_to_editorial_work', { item_id: competing })])
  invariant(!compA.error && !compB.error, 'competing applications failed')
  const [acceptA, acceptB] = await Promise.all([pm.rpc('accept_editorial_application', { application_id: compA.data }), pmSecond.rpc('accept_editorial_application', { application_id: compB.data })])
  invariant(Number(!acceptA.error) + Number(!acceptB.error) === 1, 'concurrent PM accept did not yield exactly one winner')
  const { data: finalApps } = await pm.rpc('editorial_applications', { item_id: competing })
  const { data: competingRow } = await pm.rpc('editorial_calendar', { date_from: '2030-11-01', date_to: '2030-11-10', project_filter: projectA })
  const { data: finalAssignees } = await pm.from('work_item_assignees').select('user_id').eq('work_item_id', competingRow.find((entry) => entry.item_id === competing).work_item_id).is('revoked_at', null)
  invariant(finalApps.filter((entry) => entry.status === 'accepted').length === 1 && finalApps.filter((entry) => entry.status === 'rejected').length === 1 && finalAssignees.length === 1 && finalAssignees[0].user_id === finalApps.find((entry) => entry.status === 'accepted').applicant_id, 'concurrent acceptance left incoherent state')
  console.log('ok - two PM sessions accepted different applicants concurrently; one coherent winner')

  const manual = await newPiece(`Manual editorial ${Date.now()}`)
  invariant(!(await pm.rpc('publish_editorial_available', { item_id: manual })).error, 'manual piece publish failed')
  invariant(!(await a.rpc('apply_to_editorial_work', { item_id: manual })).error, 'manual piece apply failed')
  const { data: manualRow } = await pm.rpc('editorial_calendar', { date_from: '2030-10-01', date_to: '2030-10-31', project_filter: projectA })
  const manualWork = manualRow.find((entry) => entry.item_id === manual).work_item_id
  const { error: manualError } = await pm.rpc('assign_work_item', { work_item_id: manualWork, assignee_ids: [users.b[0]], idempotency_key: randomUUID() })
  invariant(!manualError, `manual assignment failed: ${manualError?.message}`)
  const { data: manualApps } = await pm.rpc('editorial_applications', { item_id: manual })
  const { data: manualState } = await pm.from('editorial_items').select('planning_state').eq('id', manual).single()
  invariant(manualApps.every((entry) => entry.status === 'rejected') && manualState.planning_state === 'assigned', 'manual assignment left active applications')
  const { error: lateAcceptError } = await pm.rpc('accept_editorial_application', { application_id: manualApps[0].application_id })
  invariant(lateAcceptError, 'application accepted after manual assignment')
  console.log('ok - manual Work assignment resolved Editorial state and applications')

  const revoked = await newPiece(`Revoked applicant ${Date.now()}`)
  invariant(!(await pm.rpc('publish_editorial_available', { item_id: revoked })).error, 'revocation item publish failed')
  const { data: revokedApplication, error: revokedApplyError } = await b.rpc('apply_to_editorial_work', { item_id: revoked })
  invariant(!revokedApplyError && revokedApplication, 'B could not apply before membership revoke')
  const { data: memberRows } = await director.from('project_memberships').select('id').eq('project_id', projectA).eq('user_id', users.b[0])
  const { error: revokeError } = await director.rpc('revoke_project_member', { membership_id: memberRows[0].id, idempotency_key: randomUUID() })
  invariant(!revokeError, `membership revoke failed: ${revokeError?.message}`)
  const { error: revokedAcceptError } = await pm.rpc('accept_editorial_application', { application_id: revokedApplication })
  invariant(revokedAcceptError, 'revoked applicant was accepted')
  const { data: revokedVisibleApps } = await b.from('work_applications').select('id').eq('id', revokedApplication)
  invariant(revokedVisibleApps.length === 0, 'revoked contributor retained application read access')
  const { error: revokedReapplyError } = await b.rpc('apply_to_editorial_work', { item_id: revoked })
  invariant(revokedReapplyError, 'revoked applicant could apply again')
  console.log('ok - revoked Project membership blocks apply and accept')

  const { data: crossCycle, error: crossCycleError } = await director.rpc('create_editorial_cycle', { project_id: projectB, name: 'Project B isolation', start_date: '2030-10-01', end_date: '2030-10-31' })
  invariant(!crossCycleError, `director Project B cycle failed: ${crossCycleError?.message}`)
  const { data: crossItem, error: crossItemError } = await director.rpc('create_editorial_item', { project_id: projectB, cycle_id: crossCycle, template_id: null, title: 'Project B editorial', brief: '', scheduled_date: '2030-10-15', scheduled_time: null, channel: 'website', format: 'article', idempotency_key: randomUUID() })
  invariant(!crossItemError, `director Project B item failed: ${crossItemError?.message}`)
  invariant(!(await director.rpc('publish_editorial_available', { item_id: crossItem })).error, 'director Project B publish failed')
  const { data: crossApplication, error: crossApplicationError } = await b.rpc('apply_to_editorial_work', { item_id: crossItem })
  invariant(!crossApplicationError, `B Project B apply failed: ${crossApplicationError?.message}`)
  const { error: crossAcceptError } = await pm.rpc('accept_editorial_application', { application_id: crossApplication })
  invariant(crossAcceptError, 'PM A accepted a Project B application')
  const { error: crossApplyError } = await a.rpc('apply_to_editorial_work', { item_id: crossItem })
  invariant(crossApplyError, 'Contributor A applied to inaccessible Project B')
  const { error: clientApplyError } = await client.rpc('apply_to_editorial_work', { item_id: crossItem })
  invariant(clientApplyError, 'client applied to internal Editorial')
  console.log('ok - PM cannot accept an application in Project B')

  const [{ data: pmCross }, { data: contributorCross }, { data: clientRaw }, { error: clientRpc }, { error: crossCreate }] = await Promise.all([
    pm.from('editorial_items').select('id').eq('project_id', projectB),
    a.from('editorial_items').select('id').eq('project_id', projectB),
    client.from('editorial_items').select('id'),
    client.rpc('editorial_calendar', { date_from: '2030-10-01', date_to: '2030-10-31' }),
    pm.rpc('create_editorial_cycle', { project_id: projectB, name: 'Forbidden', start_date: '2030-10-01', end_date: '2030-10-31' }),
  ])
  invariant(pmCross.length === 0 && contributorCross.length === 0 && clientRaw.length === 0 && clientRpc && crossCreate, `cross-project or client isolation failed: ${JSON.stringify({ pm: pmCross.length, contributor: contributorCross.length, client: clientRaw.length, clientRpc: clientRpc?.message, crossCreate: crossCreate?.message })}`)
  const { data: editorialEvents, error: eventError } = await director.from('domain_events').select('event_type').in('event_type', ['editorial.item.created','editorial.item.available','editorial.application.created','editorial.application.accepted','editorial.application.rejected','editorial.item.assigned'])
  invariant(!eventError && editorialEvents, `editorial event read failed: ${eventError?.message}`)
  invariant(new Set(editorialEvents.map((entry) => entry.event_type)).size === 6, 'editorial event flow incomplete')
  console.log('ok - project/client isolation and editorial events verified')
  await Promise.all([director, pm, pmSecond, a, aSecond, b, client].map((instance) => instance.auth.signOut()))
  console.log('Phase 6 editorial integration passed against local Supabase.')
}

main().catch((error) => { console.error(`Phase 6 editorial integration failed: ${error.message}`); process.exitCode = 1 })
