begin;

select no_plan();

select has_table('public', 'brands', 'brands exists');
select has_table('public', 'contacts', 'contacts exists');
select has_table('public', 'pipeline_stages', 'pipeline stages exist');
select has_table('public', 'opportunities', 'opportunities exist');
select has_table('public', 'crm_activities', 'CRM activities exist');
select has_column('public', 'organizations', 'normalized_domain', 'organization domains are normalized server-side');
select has_column('public', 'contacts', 'normalized_email', 'contact emails are normalized server-side');
select has_column('public', 'opportunities', 'owner_id', 'opportunities have an explicit owner');
select has_column('public', 'crm_activities', 'is_system_generated', 'activity distinguishes system context');
select has_index('public', 'brands', 'brands_organization_status_idx', 'brand list query is indexed');
select has_index('public', 'contacts', 'contacts_organization_status_created_idx', 'contact list query is indexed');
select has_index('public', 'opportunities', 'opportunities_organization_status_created_idx', 'opportunity list query is indexed');
select has_index('public', 'crm_activities', 'crm_activities_organization_occurred_idx', 'activity timeline is indexed');

select is((select count(*) from public.pipeline_stages), 6::bigint, 'controlled pipeline stages are seeded');
select is((select count(*) from public.brands), 3::bigint, 'cross-client brand fixtures are seeded');
select is((select count(*) from public.brands where organization_id = '30000000-0000-0000-0000-00000000000a'), 2::bigint, 'Organization A has two brands');
select is((select lifecycle from public.organizations where id = '30000000-0000-0000-0000-00000000000a'), 'active_client', 'client lifecycle uses the canonical Phase 3 value');
select ok(not has_table_privilege('authenticated', 'public.brands', 'insert'), 'browser cannot directly insert brands');
select ok(not has_table_privilege('authenticated', 'public.contacts', 'update'), 'browser cannot directly move or edit contacts');
select ok(not has_table_privilege('authenticated', 'public.opportunities', 'insert'), 'browser cannot directly insert opportunities');
select ok(not has_table_privilege('authenticated', 'public.crm_activities', 'delete'), 'browser cannot delete activity history');
select ok(not has_function_privilege('anon', 'public.promote_organization_to_client(uuid,uuid)', 'execute'), 'anonymous cannot promote an organization');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($sql$ select * from public.brands $sql$, '42501', null, 'anonymous cannot read brands');
select throws_ok($sql$ select * from public.contacts $sql$, '42501', null, 'anonymous cannot read contacts');
select throws_ok($sql$ select * from public.opportunities $sql$, '42501', null, 'anonymous cannot read opportunities');
select throws_ok($sql$ select * from public.crm_activities $sql$, '42501', null, 'anonymous cannot read CRM activity');
select throws_ok($sql$ select * from public.client_organization_context() $sql$, '42501', null, 'anonymous cannot call client projections');
reset role;

-- Director integration flow.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(public.has_capability('organization.promote', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a'), 'director has explicit promotion capability');
select is((select count(*) from public.brands), 3::bigint, 'director sees all brands');
select is((select count(*) from public.contacts), 2::bigint, 'director sees all contacts');
select is((select count(*) from public.opportunities), 2::bigint, 'director sees all opportunities');
select lives_ok(
  $sql$ select public.create_crm_organization('Phase 3 Prospect', 'phase3.example', 'America/Mexico_City', '70000000-0000-0000-0000-000000000001') $sql$,
  'director creates a prospect'
);
select is(
  (select normalized_domain from public.organizations where name = 'Phase 3 Prospect'),
  'phase3.example',
  'organization domain normalization is deterministic'
);
select throws_ok(
  $sql$ select public.update_organization((select id from public.organizations where name = 'Phase 3 Prospect'), 'Phase 3 Prospect', 'phase3.example', 'America/Mexico_City', 'active_client') $sql$,
  '22023', 'organization_promotion_command_required', 'generic organization update cannot bypass the promotion command'
);
select is(
  (select public.create_crm_organization('Replay ignored', 'ignored.example', 'UTC', '70000000-0000-0000-0000-000000000001')),
  (select id from public.organizations where name = 'Phase 3 Prospect'),
  'organization creation is idempotent'
);
select throws_ok(
  $sql$ select public.create_crm_organization('Duplicate domain', 'PHASE3.EXAMPLE', 'UTC', '70000000-0000-0000-0000-000000000002') $sql$,
  '23505', null, 'normalized organization domains cannot duplicate within the agency'
);
select set_config('test.phase3_org', (select id::text from public.organizations where name = 'Phase 3 Prospect'), true);
select lives_ok(
  $sql$ select public.create_brand(current_setting('test.phase3_org')::uuid, 'Phase 3 Brand', '', '70000000-0000-0000-0000-000000000003') $sql$,
  'director creates a brand'
);
select set_config('test.phase3_brand', (select id::text from public.brands where organization_id = current_setting('test.phase3_org')::uuid), true);
select lives_ok(
  $sql$ select public.create_contact(current_setting('test.phase3_org')::uuid, 'Phase 3 Contact', 'Contact@Phase3.Example', '', 'CMO', 'Commercial context', '70000000-0000-0000-0000-000000000004') $sql$,
  'director creates a CRM contact independent of Auth'
);
select is(
  (select normalized_email from public.contacts where organization_id = current_setting('test.phase3_org')::uuid),
  'contact@phase3.example',
  'contact email is normalized'
);
select throws_ok(
  $sql$ select public.create_contact(current_setting('test.phase3_org')::uuid, 'Duplicate', ' contact@PHASE3.example ', '', '', '', '70000000-0000-0000-0000-000000000005') $sql$,
  '23505', null, 'duplicate normalized contact email is rejected'
);
select lives_ok(
  $sql$ select public.create_opportunity(current_setting('test.phase3_org')::uuid, current_setting('test.phase3_brand')::uuid, 'Phase 3 Opportunity', 'lead', 250000, 'mxn', '10000000-0000-0000-0000-000000000001', current_date + 20, '70000000-0000-0000-0000-000000000006') $sql$,
  'director creates an opportunity'
);
select set_config('test.phase3_opportunity', (select id::text from public.opportunities where organization_id = current_setting('test.phase3_org')::uuid), true);
select lives_ok(
  $sql$ select public.change_opportunity_stage(current_setting('test.phase3_opportunity')::uuid, 'proposal', '70000000-0000-0000-0000-000000000007') $sql$,
  'director advances an opportunity'
);
select is((select stage_key from public.opportunities where id = current_setting('test.phase3_opportunity')::uuid), 'proposal', 'stage transition persisted');
select lives_ok(
  $sql$ select public.promote_organization_to_client(current_setting('test.phase3_org')::uuid, '70000000-0000-0000-0000-000000000008') $sql$,
  'director atomically promotes an organization with an active brand'
);
select is((select lifecycle from public.organizations where id = current_setting('test.phase3_org')::uuid), 'active_client', 'promotion changes lifecycle atomically');
select ok(exists(select 1 from public.crm_activities where organization_id = current_setting('test.phase3_org')::uuid and activity_type = 'organization_promoted'), 'promotion records useful CRM activity');
select ok(exists(select 1 from public.domain_events where organization_id = current_setting('test.phase3_org')::uuid and event_type = 'organization.promoted'), 'promotion emits a domain event');
select ok(exists(select 1 from public.audit_events where organization_id = current_setting('test.phase3_org')::uuid and event_type = 'organization.promoted'), 'promotion emits an audit event');
select lives_ok(
  $sql$ select public.create_crm_activity(current_setting('test.phase3_org')::uuid, 'meeting', 'Discovery meeting', 'Agreed next step', null, null, current_setting('test.phase3_opportunity')::uuid) $sql$,
  'director records contextual CRM activity'
);
select lives_ok(
  $sql$ select public.archive_crm_resource('contact', (select id from public.contacts where organization_id = current_setting('test.phase3_org')::uuid)) $sql$,
  'contact uses archive-first command'
);
select is((select status from public.contacts where organization_id = current_setting('test.phase3_org')::uuid), 'archived', 'archived contact history is retained');
select throws_ok(
  $sql$ select public.create_opportunity('30000000-0000-0000-0000-00000000000a', '31000000-0000-0000-0000-0000000000b1', 'Cross organization brand', 'lead', null, 'MXN', '10000000-0000-0000-0000-000000000001', null, '70000000-0000-0000-0000-000000000009') $sql$,
  '22023', 'brand_organization_mismatch', 'an opportunity cannot attach a brand from another organization'
);
reset role;

-- PM without CRM grants.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 0::bigint, 'unscoped PM sees no organizations');
select is((select count(*) from public.brands), 0::bigint, 'unscoped PM sees no brands');
select is((select count(*) from public.pipeline_stages), 0::bigint, 'unscoped PM sees no pipeline');
select throws_ok(
  $sql$ select public.create_contact('30000000-0000-0000-0000-00000000000a', 'Blocked', 'blocked@pm.test', '', '', '', '70000000-0000-0000-0000-00000000000a') $sql$,
  '42501', 'contact_create_forbidden', 'unscoped PM cannot create a contact'
);
select throws_ok(
  $sql$ select public.promote_organization_to_client('30000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000b') $sql$,
  '42501', 'organization_promote_forbidden', 'unscoped PM cannot promote an organization'
);
reset role;

-- PM with explicit Organization A capabilities.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 1::bigint, 'scoped PM sees one organization');
select ok(exists(select 1 from public.organizations where id = '30000000-0000-0000-0000-00000000000a'), 'scoped PM sees Organization A');
select ok(not exists(select 1 from public.organizations where id = '30000000-0000-0000-0000-00000000000b'), 'scoped PM cannot see Organization B');
select is((select count(*) from public.brands), 2::bigint, 'scoped PM sees both Organization A brands');
select ok(not exists(select 1 from public.brands where id = '31000000-0000-0000-0000-0000000000b1'), 'scoped PM cannot see Brand B1');
select is((select count(*) from public.contacts), 1::bigint, 'scoped PM sees only Organization A contacts');
select is((select count(*) from public.opportunities), 1::bigint, 'scoped PM sees only Organization A opportunities');
select is((select count(*) from public.crm_activities), 1::bigint, 'scoped PM sees only Organization A activity');
select is((select count(*) from public.pipeline_stages), 6::bigint, 'scoped PM can read the controlled stage catalog');
select lives_ok(
  $sql$ select public.create_brand('30000000-0000-0000-0000-00000000000a', 'PM Brand A3', '', '70000000-0000-0000-0000-00000000000c') $sql$,
  'scoped PM creates a brand in Organization A'
);
select throws_ok(
  $sql$ select public.create_brand('30000000-0000-0000-0000-00000000000b', 'Blocked Brand', '', '70000000-0000-0000-0000-00000000000d') $sql$,
  '42501', 'brand_create_forbidden', 'scoped PM cannot create a brand in Organization B'
);
select throws_ok(
  $sql$ update public.brands set organization_id = '30000000-0000-0000-0000-00000000000b' where id = '31000000-0000-0000-0000-0000000000a1' $sql$,
  '42501', null, 'PM cannot directly move a brand across organizations'
);
select throws_ok(
  $sql$ insert into public.capability_grants (user_id,agency_id,capability_key,scope_kind,organization_id,granted_by,reason) values ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','organization.create','agency',null,'10000000-0000-0000-0000-000000000003','self escalation') $sql$,
  '42501', null, 'PM cannot self-assign a CRM capability'
);
reset role;

-- Contributor remains outside CRM despite forged metadata.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","user_metadata":{"role":"agency_director"}}', true);
select is((select count(*) from public.organizations), 0::bigint, 'contributor sees no CRM organizations');
select throws_ok(
  $sql$ select public.create_crm_organization('Blocked Contributor', 'blocked-contributor.test', 'UTC', '70000000-0000-0000-0000-00000000000e') $sql$,
  '42501', 'organization_create_forbidden', 'contributor cannot create an organization'
);
reset role;

-- Client A only sees explicit public projections.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 0::bigint, 'Client A cannot read internal organization rows');
select is((select count(*) from public.client_organization_context()), 1::bigint, 'Client A gets one public organization projection');
select is((select count(*) from public.client_brand_context(null)), 3::bigint, 'Client A gets its two fixtures plus the PM-created in-scope brand');
select ok(not exists(select 1 from public.client_brand_context(null) where brand_id = '31000000-0000-0000-0000-0000000000b1'), 'Client A cannot project Brand B1');
select is((select count(*) from public.opportunities), 0::bigint, 'Client A cannot read opportunities');
select is((select count(*) from public.pipeline_stages), 0::bigint, 'Client A cannot read internal pipeline stages');
select is((select count(*) from public.crm_activities), 0::bigint, 'Client A cannot read internal CRM activity');
select throws_ok(
  $sql$ select public.create_opportunity('30000000-0000-0000-0000-00000000000a', null, 'Client attack', 'lead', null, 'MXN', '10000000-0000-0000-0000-000000000001', null, '70000000-0000-0000-0000-00000000000f') $sql$,
  '42501', 'opportunity_create_forbidden', 'client cannot create an opportunity'
);
select throws_ok(
  $sql$ update public.organizations set lifecycle = 'archived', archived_at = now() where id = '30000000-0000-0000-0000-00000000000a' $sql$,
  '42501', null, 'client cannot edit lifecycle'
);
reset role;

-- Client B is isolated from both A brands.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000008', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select is((select count(*) from public.client_organization_context()), 1::bigint, 'Client B gets one public organization projection');
select ok(exists(select 1 from public.client_brand_context(null) where brand_id = '31000000-0000-0000-0000-0000000000b1'), 'Client B sees Brand B1');
select ok(not exists(select 1 from public.client_brand_context(null) where brand_id = '31000000-0000-0000-0000-0000000000a1'), 'Client B cannot see Brand A1');
select ok(not exists(select 1 from public.client_brand_context(null) where brand_id = '31000000-0000-0000-0000-0000000000a2'), 'Client B cannot see Brand A2');
reset role;

select * from finish();
rollback;
