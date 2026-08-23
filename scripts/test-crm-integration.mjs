import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const USERS = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pmBasic: ['10000000-0000-0000-0000-000000000002', 'pm.basic@omnia.local'],
  pmScoped: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  clientA: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
  clientB: ['10000000-0000-0000-0000-000000000008', 'client.user.b@omnia.local'],
}
const ORGANIZATION_A = '30000000-0000-0000-0000-00000000000a'
const ORGANIZATION_B = '30000000-0000-0000-0000-00000000000b'
const BRAND_A1 = '31000000-0000-0000-0000-0000000000a1'
const BRAND_A2 = '31000000-0000-0000-0000-0000000000a2'
const BRAND_B1 = '31000000-0000-0000-0000-0000000000b1'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function password() {
  return `OmniaCrm9!${randomBytes(18).toString('base64url')}`
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
  const cli = resolve('node_modules', 'supabase', 'dist', 'supabase.js')
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '-o', 'json'], { encoding: 'utf8' }))
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  const director = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.director)
  const pmBasic = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.pmBasic)
  const pmScoped = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.pmScoped)
  const clientA = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.clientA)
  const clientB = await login(admin, status.API_URL, status.PUBLISHABLE_KEY, USERS.clientB)
  console.log('ok - director, PM and client actors logged in locally')

  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const { data: organizationId, error: organizationError } = await director.rpc('create_crm_organization', {
    name: `Integration Organization ${suffix}`,
    domain: `integration-${suffix}.example`,
    timezone: 'America/Mexico_City',
    idempotency_key: randomUUID(),
  })
  invariant(!organizationError && organizationId, 'director could not create Organization')
  const { data: brandId, error: brandError } = await director.rpc('create_brand', {
    organization_id: organizationId, name: `Integration Brand ${suffix}`, timezone: '', idempotency_key: randomUUID(),
  })
  invariant(!brandError && brandId, 'director could not create Brand')
  const { data: contactId, error: contactError } = await director.rpc('create_contact', {
    organization_id: organizationId, full_name: 'Integration Contact', email: `contact-${suffix}@example.test`,
    phone: '', job_title: 'Marketing Lead', notes: 'Integration-only context', idempotency_key: randomUUID(),
  })
  invariant(!contactError && contactId, 'director could not create Contact')
  const { data: opportunityId, error: opportunityError } = await director.rpc('create_opportunity', {
    organization_id: organizationId, brand_id: brandId, name: `Integration Opportunity ${suffix}`,
    stage_key: 'lead', estimated_value: 150000, currency: 'MXN', owner_id: USERS.director[0],
    expected_close_date: null, idempotency_key: randomUUID(),
  })
  invariant(!opportunityError && opportunityId, 'director could not create Opportunity')
  const { error: stageError } = await director.rpc('change_opportunity_stage', {
    opportunity_id: opportunityId, stage_key: 'proposal', idempotency_key: randomUUID(),
  })
  invariant(!stageError, 'director could not move opportunity stage')
  const { error: promoteError } = await director.rpc('promote_organization_to_client', {
    organization_id: organizationId, idempotency_key: randomUUID(),
  })
  invariant(!promoteError, 'director could not promote Organization')
  const [{ data: activities }, { data: events }, { data: audits }] = await Promise.all([
    director.from('crm_activities').select('activity_type').eq('organization_id', organizationId),
    director.from('domain_events').select('event_type').eq('organization_id', organizationId),
    director.from('audit_events').select('event_type').eq('organization_id', organizationId),
  ])
  invariant(activities?.some((item) => item.activity_type === 'organization_promoted'), 'promotion activity missing')
  invariant(events?.some((item) => item.event_type === 'organization.promoted'), 'promotion domain event missing')
  invariant(audits?.some((item) => item.event_type === 'organization.promoted'), 'promotion audit event missing')
  console.log('ok - director Organization → Brand → Contact → Opportunity → stage → promote flow')

  const { data: basicOrganizations } = await pmBasic.from('organizations').select('id')
  invariant(basicOrganizations?.length === 0, 'unscoped PM enumerated organizations')
  const { error: basicCreateError } = await pmBasic.rpc('create_brand', {
    organization_id: ORGANIZATION_A, name: 'Blocked PM Brand', timezone: '', idempotency_key: randomUUID(),
  })
  invariant(basicCreateError, 'unscoped PM created a brand')

  const { data: scopedOrganizations } = await pmScoped.from('organizations').select('id')
  invariant(scopedOrganizations?.length === 1 && scopedOrganizations[0].id === ORGANIZATION_A, 'scoped PM organization boundary failed')
  const { data: scopedBrands } = await pmScoped.from('brands').select('id')
  invariant(scopedBrands?.some((item) => item.id === BRAND_A1) && !scopedBrands.some((item) => item.id === BRAND_B1), 'scoped PM brand isolation failed')
  const { error: scopedContactError } = await pmScoped.rpc('create_contact', {
    organization_id: ORGANIZATION_A, full_name: 'Scoped PM Contact', email: `pm-${suffix}@example.test`,
    phone: '', job_title: '', notes: '', idempotency_key: randomUUID(),
  })
  invariant(!scopedContactError, 'scoped PM could not create in Organization A')
  const { error: crossBrandError } = await pmScoped.rpc('create_brand', {
    organization_id: ORGANIZATION_B, name: 'Cross-scope Brand', timezone: '', idempotency_key: randomUUID(),
  })
  invariant(crossBrandError, 'scoped PM created in Organization B')
  console.log('ok - PM without grants denied; scoped PM limited to Organization A')

  const [{ data: contextA }, { data: brandsA }, { data: rawOrganizationsA }, { data: opportunitiesA }, { data: pipelineA }, { data: activityA }] = await Promise.all([
    clientA.rpc('client_organization_context'), clientA.rpc('client_brand_context'),
    clientA.from('organizations').select('id'), clientA.from('opportunities').select('id'),
    clientA.from('pipeline_stages').select('key'), clientA.from('crm_activities').select('id'),
  ])
  invariant(contextA?.length === 1 && contextA[0].organization_id === ORGANIZATION_A, 'Client A organization projection failed')
  invariant(brandsA?.some((item) => item.brand_id === BRAND_A1) && brandsA.some((item) => item.brand_id === BRAND_A2) && !brandsA.some((item) => item.brand_id === BRAND_B1), 'Client A brand projection isolation failed')
  invariant(rawOrganizationsA?.length === 0 && opportunitiesA?.length === 0 && pipelineA?.length === 0 && activityA?.length === 0, 'Client A read internal CRM data')

  const [{ data: contextB }, { data: brandsB }] = await Promise.all([
    clientB.rpc('client_organization_context'), clientB.rpc('client_brand_context'),
  ])
  invariant(contextB?.length === 1 && contextB[0].organization_id === ORGANIZATION_B, 'Client B organization projection failed')
  invariant(brandsB?.length === 1 && brandsB[0].brand_id === BRAND_B1 && !brandsB.some((item) => [BRAND_A1, BRAND_A2].includes(item.brand_id)), 'Client B brand isolation failed')
  console.log('ok - Client A/B projections isolated; pipeline, opportunities and activity denied')

  await Promise.all([director, pmBasic, pmScoped, clientA, clientB].map((client) => client.auth.signOut()))
  console.log('CRM integration passed against local Supabase.')
}

main().catch((error) => {
  console.error(`CRM integration failed: ${error.message}`)
  process.exitCode = 1
})

