import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const USERS = {
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  contributor: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local'],
  client: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function password() {
  return TEST_PASSWORD
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

const quickInstance = {
  instanceId: '91000000-0000-4000-8000-000000000001', widgetKey: 'quick-actions', widgetVersion: 1, config: {}, enabled: true,
}
const quickLayouts = (desktopX = 0) => ({
  desktop: [{ i: quickInstance.instanceId, x: desktopX, y: 0, w: 3, h: 2 }],
  tablet: [{ i: quickInstance.instanceId, x: 0, y: 0, w: 3, h: 2 }],
  mobile: [{ i: quickInstance.instanceId, x: 0, y: 0, w: 1, h: 2 }],
})

async function ownConfig(client) {
  const { data, error } = await client.from('dashboard_user_configs').select('*').maybeSingle()
  invariant(!error, `dashboard config read failed: ${error?.message}`)
  return data
}

async function resetOwn(client) {
  const row = await ownConfig(client)
  if (!row) return
  const { error } = await client.rpc('reset_dashboard_config', { expected_revision: row.revision })
  invariant(!error, `dashboard cleanup failed: ${error?.message}`)
}

async function main() {
  const { status } = await waitForPostgrest()
  invariant(new URL(status.API_URL).hostname === '127.0.0.1', 'integration must use loopback Supabase')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  const contributorA = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.contributor)
  const contributorB = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.contributor)
  const pm = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.pm)
  const client = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.client)
  await Promise.all([resetOwn(contributorA), resetOwn(pm)])
  console.log('ok - Phase 5 actors logged in after bounded PostgREST readiness')

  const { data: created, error: createError } = await contributorA.rpc('save_dashboard_config', {
    expected_revision: 0, registry_version: 1, widget_instances: [quickInstance], responsive_layouts: quickLayouts(),
  })
  invariant(!createError && created?.[0]?.revision === 1, `first dashboard save failed: ${createError?.message}`)
  const reloaded = await ownConfig(contributorA)
  invariant(reloaded?.responsive_layouts?.desktop?.[0]?.x === 0, 'saved dashboard did not reload')
  console.log('ok - defaults override saves and reloads through the typed preference row')

  const { data: customized, error: customizeError } = await contributorA.rpc('save_dashboard_config', {
    expected_revision: 1, registry_version: 1, widget_instances: [quickInstance], responsive_layouts: quickLayouts(3),
  })
  invariant(!customizeError && customized?.[0]?.revision === 2, 'layout customization did not increment CAS revision')
  const { data: removed, error: removeError } = await contributorA.rpc('save_dashboard_config', {
    expected_revision: 2, registry_version: 1, widget_instances: [], responsive_layouts: { desktop: [], tablet: [], mobile: [] },
  })
  invariant(!removeError && removed?.[0]?.widget_instances?.length === 0, 'widget removal failed')
  const { data: added, error: addError } = await contributorA.rpc('save_dashboard_config', {
    expected_revision: 3, registry_version: 1, widget_instances: [quickInstance], responsive_layouts: quickLayouts(),
  })
  invariant(!addError && added?.[0]?.revision === 4, 'widget add-after-remove failed')
  console.log('ok - move, remove and add persist across all breakpoints')

  const { error: crmInjection } = await contributorA.rpc('save_dashboard_config', {
    expected_revision: 4,
    registry_version: 1,
    widget_instances: [{ ...quickInstance, instanceId: '91000000-0000-4000-8000-000000000002', widgetKey: 'crm-opportunities', config: { maxItems: 4 } }],
    responsive_layouts: {
      desktop: [{ i: '91000000-0000-4000-8000-000000000002', x: 0, y: 0, w: 3, h: 2 }],
      tablet: [{ i: '91000000-0000-4000-8000-000000000002', x: 0, y: 0, w: 3, h: 2 }],
      mobile: [{ i: '91000000-0000-4000-8000-000000000002', x: 0, y: 0, w: 1, h: 2 }],
    },
  })
  invariant(crmInjection?.message.includes('dashboard_widget_forbidden'), 'contributor injected a CRM widget')
  const { error: contributorCrm } = await contributorA.rpc('dashboard_crm_summary', { max_items: 4 })
  invariant(contributorCrm?.message.includes('dashboard_crm_forbidden'), 'contributor queried CRM summary')
  console.log('ok - unauthorized actor cannot persist or query CRM dashboard data')

  const pmCrmId = '92000000-0000-4000-8000-000000000001'
  const { data: pmSaved, error: pmSaveError } = await pm.rpc('save_dashboard_config', {
    expected_revision: 0, registry_version: 1,
    widget_instances: [{ instanceId: pmCrmId, widgetKey: 'crm-opportunities', widgetVersion: 1, config: { maxItems: 4 }, enabled: true }],
    responsive_layouts: { desktop: [{ i: pmCrmId, x: 0, y: 0, w: 6, h: 3 }], tablet: [{ i: pmCrmId, x: 0, y: 0, w: 6, h: 3 }], mobile: [{ i: pmCrmId, x: 0, y: 0, w: 1, h: 2 }] },
  })
  invariant(!pmSaveError && pmSaved?.[0]?.revision === 1, `scoped PM CRM save failed: ${pmSaveError?.message}`)
  const { data: crmSummary, error: crmError } = await pm.rpc('dashboard_crm_summary', { max_items: 4 })
  invariant(!crmError && crmSummary?.opportunities, `scoped PM CRM summary failed: ${crmError?.message}`)
  console.log('ok - scoped PM persists and loads CRM only through server-authorized rows')

  const snapshot = await ownConfig(contributorB)
  invariant(snapshot?.revision === 4, 'second session did not observe revision four')
  const { data: winner, error: winnerError } = await contributorA.rpc('save_dashboard_config', {
    expected_revision: 4, registry_version: 1, widget_instances: [quickInstance], responsive_layouts: quickLayouts(3),
  })
  invariant(!winnerError && winner?.[0]?.revision === 5, 'first concurrent session did not win')
  const { error: staleError } = await contributorB.rpc('save_dashboard_config', {
    expected_revision: snapshot.revision, registry_version: 1, widget_instances: [quickInstance], responsive_layouts: quickLayouts(),
  })
  invariant(staleError?.code === '40001' && staleError.message.includes('dashboard_revision_conflict'), 'stale concurrent session overwrote the winner')
  console.log('ok - two-session CAS rejects stale writes without lost updates')

  const { error: clientSave } = await client.rpc('save_dashboard_config', { expected_revision: 0, registry_version: 1, widget_instances: [], responsive_layouts: { desktop: [], tablet: [], mobile: [] } })
  invariant(clientSave?.message.includes('dashboard_actor_forbidden'), 'client created an internal dashboard')
  const { data: clientRows } = await client.from('dashboard_user_configs').select('user_id')
  invariant(clientRows?.length === 0, 'client enumerated internal dashboard rows')
  console.log('ok - client context cannot access the internal personalized dashboard')

  console.log('roundtrips - contributor initial dashboard: 2 (config + operational); scoped PM with CRM: 3 (config + operational + CRM)')
  await Promise.all([resetOwn(contributorA), resetOwn(pm)])
  await Promise.all([contributorA, contributorB, pm, client].map((actor) => actor.auth.signOut()))
  console.log('Phase 5 dashboard integration passed against local Supabase.')
}

main().catch((error) => {
  console.error(`Phase 5 dashboard integration failed: ${error.message}`)
  process.exitCode = 1
})
