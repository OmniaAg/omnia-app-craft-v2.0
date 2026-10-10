import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const fixtureProject = '60000000-0000-0000-0000-0000000012a1'
const fixtureReport = '70000000-0000-0000-0000-000000001201'
const foreignProject = '60000000-0000-0000-0000-0000000000b1'
const filters = { p_from: '2026-09-01', p_to: '2026-09-30', p_project: fixtureProject }
const tests = []
const check = (label, condition) => { assert.ok(condition, label); tests.push(label); console.log(`PASS ${label}`) }
const ok = (result, label) => { assert.equal(result.error, null, `${label}: ${result.error?.message}`); return result.data }
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_omnia-craft', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })

const { status } = await waitForPostgrest()
assert.ok(['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname), 'local API only')
const existing = sql(`select exists(select 1 from public.projects where id='${fixtureProject}');`)
if (!/\bt\b/.test(existing)) {
  const test = readFileSync('supabase/tests/database/0012_phase_12_analytics_reporting.test.sql', 'utf8')
  sql(test.split('-- fixtures:start')[1].split('\n').slice(1).join('\n').split('-- fixtures:end')[0])
}
async function login(user) {
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false } })
  ok(await client.auth.signInWithPassword({ email: user[1], password: TEST_PASSWORD }), `login ${user[1]}`)
  return client
}
const director = await login(TEST_USERS.director)
const pm = await login(TEST_USERS.pm)
const contributor = await login(TEST_USERS.contributor)
const clientA = await login(TEST_USERS.adminA)
const clientB = await login(TEST_USERS.viewerB)
const anonymous = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false } })
try {
  const overview = ok(await director.rpc('analytics_overview', filters), 'director overview')
  check('Director authoritative work counts', overview.open_work === 3 && overview.overdue_work === 1 && overview.blocked_work === 1 && overview.completed_period === 2)
  const work = ok(await director.rpc('analytics_work', filters), 'work')
  check('Completion median exactly 2.5 days', work.median_completion_days === 2.5)
  check('All thirty days represented, sum equals server count', work.series.length === 30 && work.series.reduce((sum, s) => sum + s.count, 0) === 2)
  const day = ok(await director.rpc('analytics_work', { ...filters, p_from: '2026-09-03', p_to: '2026-09-03' }), 'timezone boundary')
  check('Mexico midnight inclusive/exclusive window', day.completed_period === 1)
  const projects = ok(await pm.rpc('analytics_projects', filters), 'PM scoped projects')
  check('PM scoped milestones/work exact', projects.total === 1 && projects.items[0].milestones_done === 1 && projects.items[0].open_work === 3)
  const pmAll = ok(await pm.rpc('analytics_projects', { p_from: filters.p_from, p_to: filters.p_to }), 'PM total')
  check('PM all means authorized projects only', pmAll.total === 3 && !pmAll.items.some(p => p.project_id === foreignProject))
  check('Foreign Project UUID denied', (await pm.rpc('analytics_overview', { ...filters, p_project: foreignProject })).error?.code === '42501')
  check('Same Organization foreign Project denied', (await pm.rpc('analytics_work', { ...filters, p_project: '60000000-0000-0000-0000-0000000000a3' })).error?.code === '42501')
  check('Foreign Organization aggregate denied', (await pm.rpc('analytics_projects', { ...filters, p_project: undefined, p_organization: '30000000-0000-0000-0000-00000000000b' })).error?.code === '42501')
  const options = ok(await pm.rpc('analytics_filter_options', { p_kind: 'organization' }), 'scoped options')
  check('Filter options do not enumerate hidden Organizations', options.total === 1)
  const editorial = ok(await director.rpc('analytics_editorial', filters), 'editorial')
  check('Editorial states/channels/formats correct', editorial.states.planned === 1 && editorial.states.available === 1 && editorial.states.assigned === 1 && editorial.channels.instagram === 2)
  const reviews = ok(await director.rpc('analytics_reviews', filters), 'reviews')
  check('Review submissions/outcomes not duplicated', reviews.submitted_period === 2 && reviews.internal_approved_period === 1 && reviews.internal_changes_period === 1 && reviews.client_approved_period === 1)
  check('Review turnaround separates internal 4h and client 24h', reviews.median_internal_hours === 4 && reviews.median_client_hours === 24)
  const billing = ok(await director.rpc('analytics_billing', filters), 'billing')
  check('MXN separated from USD', billing.currencies.length === 2 && billing.currencies[0].currency === 'MXN' && billing.currencies[1].currency === 'USD')
  check('Three line items/two payments do not multiply totals', billing.currencies[0].issued_amount === 15000 && billing.currencies[0].paid_amount === 5000 && billing.currencies[0].remaining_amount === 10000)
  check('Void payment/draft excluded; USD exactly 1000', billing.currencies[1].issued_amount === 1000 && billing.currencies[0].overdue === 1)
  const usd = ok(await director.rpc('analytics_billing', { ...filters, p_currency: 'USD' }), 'currency filter')
  check('Currency filter matches its own group', usd.currencies.length === 1 && usd.currencies[0].currency === 'USD')
  check('PM financial permission not automatic', (await pm.rpc('analytics_billing', filters)).error?.code === '42501')
  check('Contributor financial analytics denied', (await contributor.rpc('analytics_billing', filters)).error?.code === '42501')
  check('Contributor operational analytics denied', (await contributor.rpc('analytics_overview', filters)).error?.code === '42501')
  check('Client internal RPC denied', (await clientA.rpc('analytics_overview', filters)).error?.code === '42501')
  check('Anonymous RPC denied', !!(await anonymous.rpc('analytics_overview', filters)).error)
  check('Reversed dates rejected', (await director.rpc('analytics_work', { ...filters, p_from: '2026-10-01' })).error?.code === '22023')
  check('Huge date ranges rejected', (await director.rpc('analytics_reviews', { ...filters, p_from: '2000-01-01' })).error?.code === '22023')
  check('Unallowlisted filters rejected', (await director.rpc('analytics_work_details', { ...filters, p_filter: 'sql' })).error?.code === '22023')
  const page = ok(await director.rpc('analytics_work_details', { ...filters, p_filter: 'open', p_limit: 2 }), 'work page')
  check('Server paginated drilldown exact total', page.items.length === 2 && page.total === 3)
  const exported = ok(await director.rpc('export_analytics', { ...filters, p_section: 'billing' }), 'export')
  check('Export uses same filtered aggregate', JSON.stringify(exported.currencies) === JSON.stringify(billing.currencies))
  check('PM export separate permission', (await pm.rpc('export_analytics', { ...filters, p_section: 'work' })).error?.code === '42501')
  ok(await director.rpc('set_project_report_publication', { p_report: fixtureReport, p_publish: false }), 'draft state')
  check('Unpublished report not readable', (await clientA.rpc('client_project_report', { p_report: fixtureReport })).error?.code === '42501')
  ok(await director.rpc('set_project_report_publication', { p_report: fixtureReport, p_publish: true }), 'publish report')
  const report = ok(await clientA.rpc('client_project_report', { p_report: fixtureReport }), 'client report')
  check('Client sees safe known published report', report.milestones_done === 1 && report.published_deliverables === 1 && report.approvals.approved === 1)
  check('Client report has only allowlisted fields', Object.keys(report).every(key => ['id', 'title', 'project_id', 'project_name', 'project_status', 'from', 'to', 'published_at', 'as_of', 'semantics', 'milestones_done', 'milestones_pending', 'published_deliverables', 'approvals', 'published_documents'].includes(key)))
  const listed = ok(await clientA.rpc('list_project_reports'), 'client report list')
  check('Client list contains published authorized report', listed.items.some(r => r.id === fixtureReport))
  check('Cross-client foreign report denied', (await clientB.rpc('client_project_report', { p_report: fixtureReport })).error?.code === '42501')
  check('Organization membership alone not enough', (await (await login(TEST_USERS.reviewerA)).rpc('client_project_report', { p_report: fixtureReport })).error?.code === '42501')
  check('Client cannot select author identity directly', !!(await clientA.from('project_reports').select('created_by')).error)
  check('Client cannot forge publication', !!(await clientA.from('project_reports').insert({ project_id: fixtureProject, title: 'forged', from_date: filters.p_from, to_date: filters.p_to, created_by: TEST_USERS.adminA[0] })).error)
  // Test volume/performance inside a transaction: no persistent synthetic workload.
  const explain = sql(`begin;
    insert into public.work_items(project_id,title,status,created_by)
    select '${fixtureProject}','Volume '||n,case when n%3=0 then 'blocked' else 'todo' end,'${TEST_USERS.director[0]}'
    from generate_series(1,2400) n;
    analyze public.work_items;
    set local role authenticated;
    select set_config('request.jwt.claim.sub','${TEST_USERS.pm[0]}',true);
    select public.analytics_overview('2026-09-01','2026-09-30',p_project=>'${fixtureProject}')->>'open_work' as exact_open_count;
    explain (analyze,buffers) select public.analytics_work('2026-09-01','2026-09-30',p_project=>'${fixtureProject}');
    reset role;
    explain (analyze,buffers) with scope as materialized (
      select * from app_private.analytics_scope(null,null,null,'${fixtureProject}'))
      select w.status,count(*) from public.work_items w join scope s on s.project_id=w.project_id
      where w.archived_at is null group by w.status;
    create temporary table volume_docs(id uuid primary key);
    insert into volume_docs select gen_random_uuid() from generate_series(1,300);
    insert into public.billing_documents(id,organization_id,project_id,date,currency,subtotal_amount,total_amount)
    select id,'30000000-0000-0000-0000-00000000000a','${fixtureProject}','2026-09-15','MXN',100,100 from volume_docs;
    insert into public.billing_document_items(billing_document_id,description,quantity,unit_price,line_total)
    select v.id,'Volume line '||n,1,50,50 from volume_docs v cross join generate_series(1,2) n;
    update public.billing_documents set status='issued',number='PH12VOL-'||id::text where id in(select id from volume_docs);
    insert into public.payment_records(billing_document_id,amount,currency,received_at,method,recorded_by)
    select v.id,10,'MXN','2026-09-20T06:00:00Z','transfer','${TEST_USERS.director[0]}' from volume_docs v cross join generate_series(1,2) n;
    analyze public.billing_documents;
    analyze public.payment_records;
    set local role authenticated;
    select set_config('request.jwt.claim.sub','${TEST_USERS.director[0]}',true);
    select public.analytics_billing('2026-09-01','2026-09-30',p_project=>'${fixtureProject}')#>>'{currencies,0,issued_amount}' as issued_volume;
    select public.analytics_billing('2026-09-01','2026-09-30',p_project=>'${fixtureProject}')#>>'{currencies,0,paid_amount}' as paid_volume;
    explain (analyze,buffers) select public.analytics_billing('2026-09-01','2026-09-30',p_project=>'${fixtureProject}');
    rollback;`)
  // Owner SQL only allows the second EXPLAIN to expose the private query plan.
  check('2400-row aggregation exact without duplicate joins', explain.includes('2403'))
  check('300 additional documents/600 lines/600 payments exact totals', explain.includes('45000.00') && explain.includes('11000.00'))
  console.log(explain)
  console.log(`Analytics integration: ${tests.length}/${tests.length} passed.`)
} finally {
  await Promise.all([director, pm, contributor, clientA, clientB].map(client => client.auth.signOut()))
}
