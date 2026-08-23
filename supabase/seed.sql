-- Local/test-only deterministic Phase 2 fixtures.
-- The first director is provisioned here as an explicit administrative bootstrap;
-- no signup trigger grants authority and this seed is not a production bootstrap.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'director@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pm.basic@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pm.scoped@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'contributor@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"founder":true,"role":"agency_director"}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'client.admin.a@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'client.reviewer.a@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'client.viewer.a@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'client.user.b@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false);

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from auth.users as u
where u.id between
  '10000000-0000-0000-0000-000000000001'::uuid
  and '10000000-0000-0000-0000-000000000008'::uuid;

insert into public.agencies (id, name, timezone) values
  ('20000000-0000-0000-0000-000000000001', 'OMNIA', 'America/Mexico_City');

insert into public.departments (
  id, agency_id, key, name, category, sort_order
) values
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'AXIS', 'AXIS', 'direction', 10),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'LUX', 'LUX', 'operations', 20),
  ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'IMAGO', 'IMAGO', 'operations', 30),
  ('21000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'AGORA', 'AGORA', 'operations', 40),
  ('21000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'PRAXIS', 'PRAXIS', 'operations', 50),
  ('21000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'NEO KIN', 'NEO KIN', 'operations', 60);

insert into public.organizations (
  id, agency_id, name, lifecycle, timezone
) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Organization A', 'active_client', 'America/Mexico_City'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'Organization B', 'active_client', 'America/Mexico_City');

insert into public.agency_memberships (
  id, user_id, agency_id, role_key, department_id, status, classification
) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'agency_director', '21000000-0000-0000-0000-000000000001', 'active', 'employee'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'project_manager', '21000000-0000-0000-0000-000000000002', 'active', 'employee'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'project_manager', '21000000-0000-0000-0000-000000000003', 'active', 'employee'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'contributor', '21000000-0000-0000-0000-000000000004', 'active', 'founder');

insert into public.client_memberships (
  id, user_id, organization_id, role_key, status, invited_by
) values
  ('41000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-00000000000a', 'client_admin', 'active', '10000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-00000000000a', 'client_reviewer', 'active', '10000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-00000000000a', 'client_viewer', 'active', '10000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-00000000000b', 'client_viewer', 'active', '10000000-0000-0000-0000-000000000001');

insert into public.capability_grants (
  id,
  user_id,
  agency_id,
  capability_key,
  scope_kind,
  organization_id,
  granted_by,
  reason
) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'client_user.invite', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Local fixture: client invitations for Organization A only.'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'organization.view', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'organization.manage', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'organization.promote', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'brand.view', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'brand.create', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'brand.manage', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'contact.view', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'contact.create', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'contact.manage', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'opportunity.view', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'opportunity.create', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'opportunity.manage', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'crm_activity.view', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'crm_activity.create', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.'),
  ('50000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'pipeline.view', 'organization', '30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Phase 3 CRM scope for Organization A.');

insert into public.brands (id, organization_id, name, status) values
  ('31000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', 'Brand A1', 'active'),
  ('31000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-00000000000a', 'Brand A2', 'active'),
  ('31000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', 'Brand B1', 'active');

insert into public.contacts (
  id, organization_id, full_name, email, job_title
) values
  ('32000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', 'Contact A', 'contact.a@organization.test', 'Marketing Lead'),
  ('32000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', 'Contact B', 'contact.b@organization.test', 'Operations Lead');

insert into public.opportunities (
  id, organization_id, brand_id, name, stage_key, estimated_value,
  currency, owner_id, expected_close_date
) values
  ('33000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', '31000000-0000-0000-0000-0000000000a1', 'Opportunity A', 'discovery', 125000, 'MXN', '10000000-0000-0000-0000-000000000001', current_date + 30),
  ('33000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', '31000000-0000-0000-0000-0000000000b1', 'Opportunity B', 'lead', 75000, 'MXN', '10000000-0000-0000-0000-000000000001', current_date + 45);

insert into public.crm_activities (
  id, organization_id, activity_type, summary, created_by
) values
  ('34000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', 'note', 'Internal context for Organization A', '10000000-0000-0000-0000-000000000001'),
  ('34000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', 'note', 'Internal context for Organization B', '10000000-0000-0000-0000-000000000001');
