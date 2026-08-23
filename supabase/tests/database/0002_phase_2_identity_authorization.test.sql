begin;

select no_plan();

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'agencies', 'agencies exists');
select has_table('public', 'departments', 'departments exists');
select has_table('public', 'agency_memberships', 'agency memberships exist');
select has_table('public', 'organizations', 'minimal organizations exist');
select has_table('public', 'client_memberships', 'client memberships exist');
select has_table('public', 'roles', 'role catalog exists');
select has_table('public', 'capabilities', 'capability catalog exists');
select has_table('public', 'role_capabilities', 'role mappings exist');
select has_table('public', 'capability_grants', 'explicit grants exist');
select has_table('public', 'invitations', 'invitations exist');
select has_table('public', 'domain_events', 'domain events exist');
select has_table('public', 'audit_events', 'audit events exist');

select hasnt_column('public', 'profiles', 'role', 'profiles have no role authority');
select hasnt_column('public', 'profiles', 'is_admin', 'profiles have no admin flag');
select hasnt_column('public', 'profiles', 'capabilities', 'profiles have no capability data');
select hasnt_column('public', 'profiles', 'organization_id', 'profiles have no organization authority');

select is(
  (select count(*) from public.departments where agency_id = '20000000-0000-0000-0000-000000000001'),
  6::bigint,
  'all six initial departments are seeded'
);
select is(
  (select count(*) from public.client_memberships where organization_id = '30000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'Organization A supports multiple client users'
);
select is(
  (select classification from public.agency_memberships where user_id = '10000000-0000-0000-0000-000000000004'),
  'founder',
  'founder is stored only as organizational classification'
);

select ok(
  not has_table_privilege('authenticated', 'public.roles', 'insert'),
  'authenticated cannot create roles'
);
select ok(
  not has_table_privilege('authenticated', 'public.capabilities', 'insert'),
  'authenticated cannot create capabilities'
);
select ok(
  not has_table_privilege('authenticated', 'public.role_capabilities', 'update'),
  'authenticated cannot alter role mappings'
);
select ok(
  not has_table_privilege('authenticated', 'public.capability_grants', 'insert'),
  'authenticated cannot assign explicit capabilities'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'insert'),
  'authenticated cannot create fake audit history'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'update'),
  'authenticated cannot modify audit history'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'delete'),
  'authenticated cannot delete audit history'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_invitation(text,text,text,text,text,uuid,text,uuid)',
    'execute'
  ),
  'anonymous cannot execute the public invitation command wrapper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.mark_invitation_dispatched(uuid)',
    'execute'
  ),
  'authenticated cannot execute the server-only dispatch wrapper'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $sql$ select * from public.profiles $sql$,
  '42501',
  null,
  'anonymous cannot read profiles'
);
select throws_ok(
  $sql$ select * from public.organizations $sql$,
  '42501',
  null,
  'anonymous cannot read organizations'
);
select throws_ok(
  $sql$ select * from public.agency_memberships $sql$,
  '42501',
  null,
  'anonymous cannot read agency memberships'
);
select throws_ok(
  $sql$ select * from public.audit_events $sql$,
  '42501',
  null,
  'anonymous cannot read audit events'
);
select throws_ok(
  $sql$ select * from public.my_capabilities() $sql$,
  '42501',
  null,
  'anonymous cannot call my_capabilities'
);
select throws_ok(
  $sql$ select * from app_private.accept_invitation('00000000-0000-0000-0000-000000000001') $sql$,
  '42501',
  null,
  'anonymous cannot execute private invitation command'
);

reset role;

-- Director: broad capabilities are explicit role mappings, never an RLS bypass.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"director@omnia.local"}',
  true
);

select ok(
  public.has_capability(
    'agency.member.invite',
    '20000000-0000-0000-0000-000000000001',
    null
  ),
  'director has internal invite capability'
);
select ok(
  public.has_capability(
    'client_user.invite',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000b'
  ),
  'director capability applies through explicit agency scope'
);
select is(
  (select count(*) from public.organizations),
  2::bigint,
  'director reads organizations through policy, not bypass'
);
select is(
  (select count(*) from public.agency_memberships),
  1::bigint,
  'direct table access to agency memberships remains self-only'
);
select lives_ok(
  $sql$
    select public.create_organization(
      'Phase 2 Created Organization',
      'America/Mexico_City',
      '60000000-0000-0000-0000-00000000000d'
    )
  $sql$,
  'director can create a minimal organization through the command boundary'
);
select is(
  (
    select count(*) from public.organizations
    where name = 'Phase 2 Created Organization'
  ),
  1::bigint,
  'organization command creates exactly one scoped resource'
);
select is(
  (
    select public.create_organization(
      'Ignored replay name',
      'UTC',
      '60000000-0000-0000-0000-00000000000d'
    )
  ),
  (
    select id from public.organizations
    where name = 'Phase 2 Created Organization'
  ),
  'organization command replay returns the original resource'
);
select lives_ok(
  $sql$
    update public.profiles
    set display_name = 'Directora OMNIA', timezone = 'America/Mexico_City'
    where user_id = '10000000-0000-0000-0000-000000000001'
  $sql$,
  'actor can update presentational profile fields'
);
select throws_ok(
  $sql$
    update public.agency_memberships
    set role_key = 'agency_director'
    where user_id = '10000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  null,
  'actor cannot directly edit own agency membership'
);
select throws_ok(
  $sql$ insert into public.capabilities (key, description) values ('system.takeover', 'no') $sql$,
  '42501',
  null,
  'actor cannot create a capability'
);
select throws_ok(
  $sql$
    insert into public.capability_grants (
      user_id, agency_id, capability_key, scope_kind, granted_by, reason
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'client_user.invite',
      'agency',
      '10000000-0000-0000-0000-000000000001',
      'self escalation'
    )
  $sql$,
  '42501',
  null,
  'actor cannot grant a capability to self'
);
select throws_ok(
  $sql$
    insert into public.audit_events (
      domain_event_id, event_type, actor_id, resource_type, resource_id,
      correlation_id, payload
    ) values (
      gen_random_uuid(), 'fake.audit', '10000000-0000-0000-0000-000000000001',
      'profile', '10000000-0000-0000-0000-000000000001', gen_random_uuid(), '{}'
    )
  $sql$,
  '42501',
  null,
  'browser actor cannot forge audit events'
);

select lives_ok(
  $sql$
    select * from public.create_invitation(
      'internal',
      'new.member@omnia.local',
      'contributor',
      'LUX',
      'contractor',
      null,
      null,
      '60000000-0000-0000-0000-000000000001'
    )
  $sql$,
  'director can create an internal invitation'
);
select lives_ok(
  $sql$
    select * from public.create_invitation(
      'client',
      'new.client@omnia.local',
      null,
      null,
      null,
      '30000000-0000-0000-0000-00000000000a',
      'client_viewer',
      '60000000-0000-0000-0000-000000000002'
    )
  $sql$,
  'director can create a client invitation'
);
select is(
  (
    select invitation_id
    from public.create_invitation(
      'client',
      'new.client@omnia.local',
      null,
      null,
      null,
      '30000000-0000-0000-0000-00000000000a',
      'client_viewer',
      '60000000-0000-0000-0000-000000000002'
    )
  ),
  (
    select id from public.invitations
    where invited_by = '10000000-0000-0000-0000-000000000001'
      and idempotency_key = '60000000-0000-0000-0000-000000000002'
  ),
  'invitation replay returns the original invitation'
);
select ok(
  (
    select is_replay
    from public.create_invitation(
      'client',
      'new.client@omnia.local',
      null,
      null,
      null,
      '30000000-0000-0000-0000-00000000000a',
      'client_viewer',
      '60000000-0000-0000-0000-000000000002'
    )
  ),
  'invitation replay is reported explicitly'
);
select throws_ok(
  $sql$
    select * from public.create_invitation(
      'internal',
      'invalid.department@omnia.local',
      'contributor',
      'AXIS',
      'employee',
      null,
      null,
      '60000000-0000-0000-0000-000000000003'
    )
  $sql$,
  '22023',
  'invalid_agency_role_department',
  'invalid department-role combinations are rejected'
);
select throws_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'invalid.organization@omnia.local', null, null, null,
      '30000000-0000-0000-0000-000000000099', 'client_viewer',
      '60000000-0000-0000-0000-00000000000e'
    )
  $sql$,
  '42501',
  'client_invitation_forbidden',
  'invitation to a nonexistent organization is rejected'
);
select throws_ok(
  $sql$
    select public.update_agency_membership(
      '40000000-0000-0000-0000-000000000001',
      'agency_director',
      'AXIS',
      'founder',
      '60000000-0000-0000-0000-000000000004'
    )
  $sql$,
  '42501',
  'membership_update_forbidden',
  'even director cannot use the command to edit own authority'
);
select lives_ok(
  $sql$
    select public.update_agency_membership(
      '40000000-0000-0000-0000-000000000002',
      'contributor',
      'PRAXIS',
      'contractor',
      '60000000-0000-0000-0000-00000000000b'
    )
  $sql$,
  'director can assign a valid role, department and classification to another member'
);
reset role;

-- Restore the deterministic PM fixture after proving the privileged mutation path.
select is(
  (
    select am.role_key || ':' || d.key || ':' || am.classification
    from public.agency_memberships as am
    join public.departments as d on d.id = am.department_id
    where am.id = '40000000-0000-0000-0000-000000000002'
  ),
  'contributor:PRAXIS:contractor',
  'the authorized membership assignment persists exactly the requested server values'
);
update public.agency_memberships
set role_key = 'project_manager',
    department_id = '21000000-0000-0000-0000-000000000002',
    classification = 'employee'
where id = '40000000-0000-0000-0000-000000000002';

-- Project manager without an explicit grant remains limited.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","email":"pm.basic@omnia.local"}',
  true
);

select ok(
  not public.has_capability(
    'client_user.invite',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000a'
  ),
  'basic PM has no client invitation capability'
);
select ok(
  not public.has_capability(
    'organization.view',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000a'
  ),
  'PM role does not accidentally grant global organization access'
);
select is((select count(*) from public.organizations), 0::bigint, 'basic PM sees no organizations');
select throws_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'blocked.pm@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_viewer',
      '60000000-0000-0000-0000-000000000005'
    )
  $sql$,
  '42501',
  'client_invitation_forbidden',
  'basic PM cannot invite a client user'
);

reset role;

-- Explicit capability grant remains resource scoped.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","email":"pm.scoped@omnia.local"}',
  true
);

select ok(
  public.has_capability(
    'client_user.invite',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000a'
  ),
  'scoped PM has client invite capability for Organization A'
);
select ok(
  not public.has_capability(
    'client_user.invite',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000b'
  ),
  'scoped PM capability does not cross into Organization B'
);
select ok(
  exists (
    select 1 from public.my_capabilities()
    where capability_key = 'client_user.invite'
      and scope_kind = 'organization'
      and scope_id = '30000000-0000-0000-0000-00000000000a'
  ),
  'my_capabilities projects the exact explicit scope'
);
select lives_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'pm.allowed@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_reviewer',
      '60000000-0000-0000-0000-000000000006'
    )
  $sql$,
  'scoped PM can invite within Organization A'
);
select throws_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'pm.cross@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000b', 'client_reviewer',
      '60000000-0000-0000-0000-000000000007'
    )
  $sql$,
  '42501',
  'client_invitation_forbidden',
  'scoped PM cannot invite across organizations'
);

reset role;

-- Founder and editable user metadata never grant authority.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","email":"contributor@omnia.local","user_metadata":{"founder":true,"role":"agency_director","capabilities":["client_user.invite"]},"app_metadata":{"role":"agency_director"}}',
  true
);

select ok(
  not public.has_capability(
    'agency.member.manage',
    '20000000-0000-0000-0000-000000000001',
    null
  ),
  'founder classification and forged metadata grant no member authority'
);
select ok(
  not public.has_capability(
    'client_user.invite',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000a'
  ),
  'contributor remains unable to invite clients despite metadata attack'
);
select ok(
  not public.has_capability(
    'organization.create',
    '20000000-0000-0000-0000-000000000001',
    null
  ),
  'department membership alone grants no organization capability'
);
select throws_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'blocked.contributor@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_viewer',
      '60000000-0000-0000-0000-000000000008'
    )
  $sql$,
  '42501',
  'client_invitation_forbidden',
  'contributor cannot invite a client user'
);
select is((select count(*) from public.audit_events), 0::bigint, 'contributor cannot read audit history');

reset role;

-- Client isolation is enforced directly by PostgreSQL RLS.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","email":"client.admin.a@omnia.local"}',
  true
);

select is((select count(*) from public.organizations), 0::bigint, 'Client A cannot read the internal organization table');
select ok(
  exists (
    select 1 from public.client_organization_context()
    where organization_id = '30000000-0000-0000-0000-00000000000a'
  ),
  'Client A sees Organization A through the explicit public projection'
);
select ok(
  not exists (
    select 1 from public.client_organization_context()
    where organization_id = '30000000-0000-0000-0000-00000000000b'
  ),
  'Client A projection excludes Organization B'
);
select ok(
  not public.has_capability(
    'client_user.invite',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-00000000000a'
  ),
  'client_admin does not receive invite authority in MVP'
);
select throws_ok(
  $sql$
    update public.client_memberships
    set organization_id = '30000000-0000-0000-0000-00000000000b'
    where user_id = '10000000-0000-0000-0000-000000000005'
  $sql$,
  '42501',
  null,
  'client cannot move own membership to another organization'
);
select throws_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'blocked.client@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_viewer',
      '60000000-0000-0000-0000-000000000009'
    )
  $sql$,
  '42501',
  'client_invitation_forbidden',
  'client user cannot invite another client user'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000008', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated","email":"client.user.b@omnia.local"}',
  true
);

select is((select count(*) from public.organizations), 0::bigint, 'Client B cannot read the internal organization table');
select ok(
  exists (
    select 1 from public.client_organization_context()
    where organization_id = '30000000-0000-0000-0000-00000000000b'
  ),
  'Client B sees Organization B through the explicit public projection'
);
select ok(
  not exists (
    select 1 from public.client_organization_context()
    where organization_id = '30000000-0000-0000-0000-00000000000a'
  ),
  'Client B projection excludes Organization A'
);

reset role;

-- Invite acceptance is email-bound, single-use and transactional.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000009',
  'authenticated', 'authenticated', 'accept.client@omnia.local', now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"agency_director"}', now(), now(), false, false
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated', 'expired.client@omnia.local', now(),
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now(), false, false
);

select ok(
  exists (
    select 1 from public.profiles
    where user_id = '10000000-0000-0000-0000-000000000009'
  ),
  'auth user trigger provisions a minimal profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"director@omnia.local"}',
  true
);

select lives_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'accept.client@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_viewer',
      '60000000-0000-0000-0000-00000000000a'
    )
  $sql$,
  'director creates invitation for acceptance test'
);
select lives_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'expired.client@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_viewer',
      '60000000-0000-0000-0000-00000000000c'
    )
  $sql$,
  'director creates invitation for expiration test'
);
select set_config(
  'test.accept_invitation_id',
  (select id::text from public.invitations where email = 'accept.client@omnia.local'),
  true
);
select set_config(
  'test.expired_invitation_id',
  (select id::text from public.invitations where email = 'expired.client@omnia.local'),
  true
);

reset role;
update public.invitations
set created_at = now() - interval '3 days',
    expires_at = now() - interval '1 day'
where id = current_setting('test.expired_invitation_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000009', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000009","role":"authenticated","email":"accept.client@omnia.local","user_metadata":{"role":"agency_director"}}',
  true
);

select lives_ok(
  $sql$
    select public.accept_invitation(
      current_setting('test.accept_invitation_id')::uuid
    )
  $sql$,
  'matching authenticated user accepts invitation'
);
select ok(
  exists (
    select 1 from public.client_memberships
    where user_id = '10000000-0000-0000-0000-000000000009'
      and organization_id = '30000000-0000-0000-0000-00000000000a'
      and role_key = 'client_viewer'
  ),
  'acceptance creates the exact server-defined client membership'
);
select lives_ok(
  $sql$
    select public.accept_invitation(
      current_setting('test.accept_invitation_id')::uuid
    )
  $sql$,
  'same actor replaying accepted invitation is idempotent'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000010', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000010","role":"authenticated","email":"expired.client@omnia.local"}',
  true
);
select throws_ok(
  $sql$
    select public.accept_invitation(
      current_setting('test.expired_invitation_id')::uuid
    )
  $sql$,
  '22023',
  'invitation_expired',
  'expired invitation cannot be accepted'
);
select throws_ok(
  $sql$
    select public.accept_invitation(
      current_setting('test.accept_invitation_id')::uuid
    )
  $sql$,
  '42501',
  'invitation_not_available',
  'an accepted invitation cannot be reused by another actor'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"director@omnia.local"}',
  true
);
select lives_ok(
  $sql$
    select * from public.create_invitation(
      'client', 'expired.client@omnia.local', null, null, null,
      '30000000-0000-0000-0000-00000000000a', 'client_viewer',
      '60000000-0000-0000-0000-00000000000f'
    )
  $sql$,
  'director can replace an expired invitation with a new pending invitation'
);

reset role;
select is(
  (
    select string_agg(status, ',' order by status)
    from public.invitations
    where email = 'expired.client@omnia.local'
  ),
  'expired,pending',
  'expired invitation history is retained without blocking the replacement'
);

select is(
  (
    select count(*) from public.domain_events as de
    join public.audit_events as ae on ae.domain_event_id = de.event_id
  ),
  (select count(*) from public.domain_events),
  'every domain event created by Phase 2 commands has an audit event'
);
select ok(
  exists (
    select 1 from public.domain_events
    where event_type = 'auth.invitation.accepted'
      and actor_id = '10000000-0000-0000-0000-000000000009'
  ),
  'acceptance emits the canonical auth event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"director@omnia.local"}',
  true
);

select ok((select count(*) from public.audit_events) > 0, 'director with audit.view reads audit history');
select throws_ok(
  $sql$
    update public.audit_events set payload = '{"forged":true}'
  $sql$,
  '42501',
  null,
  'even audit reader cannot modify history'
);
select throws_ok(
  $sql$ select public.mark_invitation_dispatched('00000000-0000-0000-0000-000000000001') $sql$,
  '42501',
  null,
  'authenticated actor cannot call server-only dispatch marker'
);

reset role;

select * from finish();
rollback;
