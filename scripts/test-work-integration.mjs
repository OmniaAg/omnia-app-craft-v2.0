import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const USERS = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pmA: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  contributorA: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local'],
  clientA: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
  clientViewerA: ['10000000-0000-0000-0000-000000000007', 'client.viewer.a@omnia.local'],
}
const PROJECT_A1 = '60000000-0000-0000-0000-0000000000a1'
const PROJECT_A2 = '60000000-0000-0000-0000-0000000000a2'
const PROJECT_A3 = '60000000-0000-0000-0000-0000000000a3'
const BRAND_A1 = '31000000-0000-0000-0000-0000000000a1'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function password() {
  return `OmniaWork9!${randomBytes(18).toString('base64url')}`
}

function browserClient(apiUrl, key) {
  return createClient(apiUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(admin, apiUrl, key, [id, email]) {
  const nextPassword = password()
  const { error: updateError } = await admin.auth.admin.updateUserById(id, { password: nextPassword, email_confirm: true })
  invariant(!updateError, `password bootstrap failed for ${email}`)
  const client = browserClient(apiUrl, key)
  const { error } = await client.auth.signInWithPassword({ email, password: nextPassword })
  invariant(!error, `login failed for ${email}`)
  return client
}

async function main() {
  const { status } = await waitForPostgrest()
  invariant(new URL(status.API_URL).hostname === '127.0.0.1', 'integration must use loopback Supabase')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  const director = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.director)
  const pmA = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.pmA)
  const contributorA = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.contributorA)
  const clientA = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.clientA)
  const clientViewerA = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.clientViewerA)
  console.log('ok - Phase 4 actors logged in against loopback Supabase')

  const [{ data: pmProjects, error: pmProjectsError }, { data: contributorProjects, error: contributorProjectsError }, { data: directorProjects, error: directorProjectsError }] = await Promise.all([
    pmA.rpc('list_projects'), contributorA.rpc('list_projects'), director.rpc('list_projects'),
  ])
  invariant(!pmProjectsError && !contributorProjectsError && !directorProjectsError, `project list RPC failed (${JSON.stringify({ pm: pmProjectsError?.message, contributor: contributorProjectsError?.message, director: directorProjectsError?.message })})`)
  invariant(pmProjects?.some((item) => item.project_id === PROJECT_A1) && pmProjects.some((item) => item.project_id === PROJECT_A2) && !pmProjects.some((item) => item.project_id === PROJECT_A3), 'PM project membership boundary failed')
  invariant(contributorProjects?.some((item) => item.project_id === PROJECT_A1) && !contributorProjects.some((item) => [PROJECT_A2, PROJECT_A3].includes(item.project_id)), `contributor project boundary failed (${JSON.stringify(contributorProjects?.map((item) => item.project_id))})`)
  invariant(directorProjects?.some((item) => item.project_id === PROJECT_A3), 'director portfolio projection failed')
  console.log('ok - director, PM and contributor project projections are isolated')

  const flowSuffix = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const { data: flowProjectId, error: flowProjectError } = await director.rpc('create_project', {
    brand_id: BRAND_A1,
    name: `Integration Project ${flowSuffix}`,
    description: 'Local end-to-end Phase 4 flow.',
    status: 'active',
    start_date: null,
    target_end_date: null,
    timezone: 'America/Mexico_City',
    idempotency_key: randomUUID(),
  })
  invariant(!flowProjectError && flowProjectId, 'director could not create project')
  const [{ error: addPmError }, { error: addContributorError }] = await Promise.all([
    director.rpc('add_project_member', { project_id: flowProjectId, user_id: USERS.pmA[0], member_type: 'internal', responsibility: 'lead', idempotency_key: randomUUID() }),
    director.rpc('add_project_member', { project_id: flowProjectId, user_id: USERS.contributorA[0], member_type: 'internal', responsibility: 'member', idempotency_key: randomUUID() }),
  ])
  invariant(!addPmError && !addContributorError, 'director could not add PM and contributor')
  const { data: milestoneId, error: milestoneError } = await director.rpc('create_milestone', {
    project_id: flowProjectId,
    name: 'Integration milestone',
    description: '',
    due_date: null,
    sort_order: 0,
    idempotency_key: randomUUID(),
  })
  invariant(!milestoneError && milestoneId, 'director could not create milestone')
  const workTitle = `Integration work ${flowSuffix}`
  const { data: workId, error: createError } = await pmA.rpc('create_work_item', {
    project_id: flowProjectId,
    title: workTitle,
    description: 'Created by the local Phase 4 integration flow.',
    priority: 'high',
    due_local: '2030-01-15T10:00:00',
    milestone_id: milestoneId,
    assignee_ids: [USERS.contributorA[0]],
    idempotency_key: randomUUID(),
  })
  invariant(!createError && workId, 'PM could not create assigned work')
  const { data: contributorSpace } = await contributorA.rpc('my_space_items')
  invariant(contributorSpace?.some((item) => item.item_id === workId && item.item_kind === 'project'), 'assigned work did not reach contributor My Space')
  const { error: transitionError } = await contributorA.rpc('transition_work_item', { work_item_id: workId, status: 'in_progress', idempotency_key: randomUUID() })
  invariant(!transitionError, 'assigned contributor could not transition work')
  const { error: commentError } = await contributorA.rpc('create_work_item_comment', { work_item_id: workId, body: 'Integration progress note.', idempotency_key: randomUUID() })
  invariant(!commentError, 'assigned contributor could not comment')
  const [{ data: comments }, { data: events }] = await Promise.all([
    pmA.rpc('work_item_comments_list', { work_item_id: workId }),
    pmA.rpc('work_item_event_list', { work_item_id: workId }),
  ])
  invariant(comments?.some((item) => item.body === 'Integration progress note.' && item.author_id === USERS.contributorA[0]), 'server-derived comment author failed')
  invariant(events?.some((item) => item.event_type === 'work.status_changed'), 'work transition event missing')
  console.log('ok - create → assign → My Space → transition → comment → history flow')

  const { error: selfAssignError } = await contributorA.rpc('assign_work_item', { work_item_id: workId, assignee_ids: [USERS.contributorA[0]], idempotency_key: randomUUID() })
  invariant(selfAssignError, 'contributor reassigned work without authority')
  const { error: crossProjectError } = await pmA.rpc('project_detail', { project_id: PROJECT_A3 })
  invariant(crossProjectError, 'PM opened a project without membership')
  console.log('ok - assignment escalation and cross-project access are denied')

  const { error: completeError } = await pmA.rpc('transition_work_item', { work_item_id: workId, status: 'done', idempotency_key: randomUUID() })
  invariant(!completeError, 'PM could not complete work')
  const { data: completedWork } = await pmA.rpc('project_work_items', { project_id: flowProjectId })
  invariant(completedWork?.find((item) => item.work_item_id === workId)?.completed_at, 'completion did not derive completed_at')
  const { error: archiveWorkError } = await pmA.rpc('archive_work_item', { work_item_id: workId, idempotency_key: randomUUID() })
  invariant(!archiveWorkError, 'PM could not archive completed work')
  const { error: archiveProjectError } = await director.rpc('archive_project', { project_id: flowProjectId, idempotency_key: randomUUID() })
  invariant(!archiveProjectError, 'director could not archive integration project')
  console.log('ok - PM completes and archives work; director archives project')

  const personalTitle = `Private integration ${Date.now()}`
  const { data: personalId, error: personalError } = await contributorA.rpc('create_personal_work_item', { item_type: 'todo', title: personalTitle, description: '', priority: 'normal', due_local: null })
  invariant(!personalError && personalId, 'contributor could not create personal work')
  const { data: pmSpace } = await pmA.rpc('my_space_items')
  invariant(!pmSpace?.some((item) => item.item_id === personalId), 'PM read another user personal work')
  console.log('ok - personal work stays separate and private')

  const [{ data: clientProjection }, { data: rawWork }, { data: rawComments }, { data: viewerProjection }] = await Promise.all([
    clientA.rpc('client_project_context'),
    clientA.from('work_items').select('id'),
    clientA.from('work_item_comments').select('id'),
    clientViewerA.rpc('client_project_context'),
  ])
  invariant(clientProjection?.length === 1 && clientProjection[0].project_id === PROJECT_A1, 'client project projection failed')
  invariant(rawWork?.length === 0 && rawComments?.length === 0, 'client read internal work or comments')
  invariant(viewerProjection?.length === 0, 'organization membership implied project membership')
  console.log('ok - client projection is basic; work, comments and implicit membership stay hidden')

  await Promise.all([director, pmA, contributorA, clientA, clientViewerA].map((client) => client.auth.signOut()))
  console.log('Phase 4 integration passed against local Supabase.')
}

main().catch((error) => {
  console.error(`Phase 4 integration failed: ${error.message}`)
  process.exitCode = 1
})
