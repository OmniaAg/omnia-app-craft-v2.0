-- Local/test-only deterministic Phase 4 fixtures.
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
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'client.user.b@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'contributor.b@omnia.local', null, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false);

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
  and '10000000-0000-0000-0000-000000000011'::uuid;

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
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'contributor', '21000000-0000-0000-0000-000000000004', 'active', 'founder'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'contributor', '21000000-0000-0000-0000-000000000005', 'active', 'contractor');

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

insert into public.projects (
  id, brand_id, name, description, status, start_date, target_end_date,
  timezone, created_by
) values
  ('60000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-0000000000a1', 'Project A1', 'Primary authorized Project for PM A and Contributor A.', 'active', current_date - 20, current_date + 40, 'America/Mexico_City', '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000a2', '31000000-0000-0000-0000-0000000000a1', 'Project A2', 'Second Project assigned only to PM A.', 'planning', current_date, current_date + 60, 'America/Mexico_City', '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000a3', '31000000-0000-0000-0000-0000000000a2', 'Project A3', 'Project isolated from PM A and assigned to Client A2.', 'active', current_date - 5, current_date + 25, 'America/Mexico_City', '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000b1', '31000000-0000-0000-0000-0000000000b1', 'Project B1', 'Organization B Project isolated from Organization A actors.', 'active', current_date - 10, current_date + 30, 'America/Mexico_City', '10000000-0000-0000-0000-000000000001');

insert into public.project_memberships (
  id, project_id, user_id, member_type, responsibility, status, created_by
) values
  ('61000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003', 'internal', 'lead', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', 'internal', 'member', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000005', 'client', 'client_member', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000a4', '60000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000003', 'internal', 'lead', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000a5', '60000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000001', 'internal', 'lead', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000a6', '60000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000006', 'client', 'client_member', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'internal', 'lead', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000011', 'internal', 'member', 'active', '10000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000b3', '60000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000008', 'client', 'client_member', 'active', '10000000-0000-0000-0000-000000000001');

insert into public.milestones (
  id, project_id, name, description, due_date, status, sort_order, created_by
) values
  ('62000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', 'Discovery complete', 'Validated operating brief.', current_date + 7, 'in_progress', 10, '10000000-0000-0000-0000-000000000003'),
  ('62000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a2', 'Kickoff', null, current_date + 14, 'planned', 10, '10000000-0000-0000-0000-000000000003'),
  ('62000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1', 'Operational handoff', null, current_date + 12, 'planned', 10, '10000000-0000-0000-0000-000000000002');

insert into public.work_items (
  id, project_id, milestone_id, title, description, status, priority,
  created_by, due_at
) values
  ('63000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', '62000000-0000-0000-0000-0000000000a1', 'Resolve overdue brief', 'Internal Project A1 work.', 'todo', 'urgent', '10000000-0000-0000-0000-000000000003', ((((now() at time zone 'America/Mexico_City')::date - 1)::timestamp) + time '17:00') at time zone 'America/Mexico_City'),
  ('63000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', '62000000-0000-0000-0000-0000000000a1', 'Prepare today update', 'Due today in Mexico City.', 'in_progress', 'high', '10000000-0000-0000-0000-000000000003', (((now() at time zone 'America/Mexico_City')::date::timestamp) + time '17:00') at time zone 'America/Mexico_City'),
  ('63000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000000a1', null, 'Unblock future asset', null, 'blocked', 'normal', '10000000-0000-0000-0000-000000000003', ((((now() at time zone 'America/Mexico_City')::date + 5)::timestamp) + time '12:00') at time zone 'America/Mexico_City'),
  ('63000000-0000-0000-0000-0000000000a4', '60000000-0000-0000-0000-0000000000a2', '62000000-0000-0000-0000-0000000000a2', 'Plan Project A2 kickoff', null, 'todo', 'normal', '10000000-0000-0000-0000-000000000003', ((current_date + 10)::timestamp + time '10:00') at time zone 'America/Mexico_City'),
  ('63000000-0000-0000-0000-0000000000a5', '60000000-0000-0000-0000-0000000000a3', null, 'Internal Project A3 work', 'Must never leak to Client A2.', 'todo', 'high', '10000000-0000-0000-0000-000000000001', null),
  ('63000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1', '62000000-0000-0000-0000-0000000000b1', 'Organization B internal work', null, 'todo', 'high', '10000000-0000-0000-0000-000000000002', ((current_date + 2)::timestamp + time '16:00') at time zone 'America/Mexico_City');

insert into public.work_item_assignees (
  id, work_item_id, user_id, assigned_by
) values
  ('64000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003'),
  ('64000000-0000-0000-0000-0000000000a2', '63000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003'),
  ('64000000-0000-0000-0000-0000000000a3', '63000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003'),
  ('64000000-0000-0000-0000-0000000000a4', '63000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003'),
  ('64000000-0000-0000-0000-0000000000a5', '63000000-0000-0000-0000-0000000000a5', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('64000000-0000-0000-0000-0000000000b1', '63000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002');

insert into public.work_item_comments (
  id, work_item_id, author_id, body
) values
  ('65000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', 'Internal comment visible only to authorized internal actors.'),
  ('65000000-0000-0000-0000-0000000000b1', '63000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000011', 'Organization B internal comment.');

insert into public.personal_work_items (
  id, user_id, item_type, title, description, status, priority, due_at
) values
  ('66000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', 'todo', 'Personal follow-up', 'Self-owned and unrelated to Project assignment.', 'open', 'normal', ((current_date + 1)::timestamp + time '09:00') at time zone 'America/Mexico_City'),
  ('66000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000004', 'note', 'Personal reference note', null, 'open', 'low', null),
  ('66000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000011', 'reminder', 'Contributor B reminder', null, 'open', 'normal', ((current_date + 3)::timestamp + time '09:00') at time zone 'America/Mexico_City');
