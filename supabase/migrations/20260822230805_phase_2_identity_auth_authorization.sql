-- Phase 2 — Identity, Auth & Authorization.
-- Authorization is derived from memberships, server-managed role mappings,
-- explicit capability grants and resource scope. Profiles are presentational.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 120),
  constraint profiles_timezone_length
    check (char_length(timezone) between 1 and 80)
);

comment on table public.profiles is
  'Presentational identity only. Roles, memberships and capabilities never live here.';

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_name_length check (char_length(name) between 1 and 160),
  constraint agencies_timezone_length check (char_length(timezone) between 1 and 80)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete restrict,
  key text not null,
  name text not null,
  category text not null,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_agency_key_unique unique (agency_id, key),
  constraint departments_key_format check (key ~ '^[A-Z][A-Z _-]{1,39}$'),
  constraint departments_name_length check (char_length(name) between 1 and 80),
  constraint departments_category_check check (category in ('direction', 'operations'))
);

create index departments_agency_id_idx on public.departments (agency_id);

create table public.roles (
  key text primary key,
  context text not null,
  display_name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint roles_context_check check (context in ('agency', 'client')),
  constraint roles_display_name_length check (char_length(display_name) between 1 and 80)
);

create table public.capabilities (
  key text primary key,
  description text not null,
  resource_scope_required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint capabilities_key_format
    check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create table public.role_capabilities (
  role_key text not null references public.roles(key) on delete restrict,
  capability_key text not null references public.capabilities(key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_key, capability_key)
);

create index role_capabilities_capability_key_idx
  on public.role_capabilities (capability_key);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete restrict,
  name text not null,
  lifecycle text not null default 'prospect',
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint organizations_name_length check (char_length(name) between 1 and 200),
  constraint organizations_lifecycle_check
    check (lifecycle in ('prospect', 'client', 'inactive', 'archived')),
  constraint organizations_timezone_length check (char_length(timezone) between 1 and 80),
  constraint organizations_archive_consistency
    check ((lifecycle = 'archived') = (archived_at is not null))
);

create index organizations_agency_id_idx on public.organizations (agency_id);
create index organizations_active_agency_idx
  on public.organizations (agency_id, created_at)
  where archived_at is null;

create table public.agency_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  role_key text not null references public.roles(key) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  status text not null default 'active',
  classification text not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint agency_memberships_user_agency_unique unique (user_id, agency_id),
  constraint agency_memberships_status_check
    check (status in ('invited', 'active', 'suspended', 'archived')),
  constraint agency_memberships_classification_check
    check (classification in ('founder', 'employee', 'external_collaborator', 'contractor')),
  constraint agency_memberships_archive_consistency
    check ((status = 'archived') = (archived_at is not null))
);

create index agency_memberships_agency_id_idx
  on public.agency_memberships (agency_id);
create index agency_memberships_role_key_idx
  on public.agency_memberships (role_key);
create index agency_memberships_department_id_idx
  on public.agency_memberships (department_id);
create index agency_memberships_active_user_idx
  on public.agency_memberships (user_id, agency_id)
  where status = 'active';

create table public.client_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role_key text not null references public.roles(key) on delete restrict,
  status text not null default 'active',
  invited_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint client_memberships_user_organization_unique unique (user_id, organization_id),
  constraint client_memberships_status_check
    check (status in ('invited', 'active', 'suspended', 'archived')),
  constraint client_memberships_archive_consistency
    check ((status = 'archived') = (archived_at is not null))
);

create index client_memberships_organization_id_idx
  on public.client_memberships (organization_id);
create index client_memberships_role_key_idx
  on public.client_memberships (role_key);
create index client_memberships_invited_by_idx
  on public.client_memberships (invited_by);
create index client_memberships_active_user_idx
  on public.client_memberships (user_id, organization_id)
  where status = 'active';

create table public.capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  capability_key text not null references public.capabilities(key) on delete restrict,
  scope_kind text not null,
  organization_id uuid references public.organizations(id) on delete restrict,
  granted_by uuid references public.profiles(user_id) on delete set null,
  reason text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint capability_grants_scope_kind_check
    check (scope_kind in ('agency', 'organization')),
  constraint capability_grants_scope_consistency check (
    (scope_kind = 'agency' and organization_id is null)
    or (scope_kind = 'organization' and organization_id is not null)
  ),
  constraint capability_grants_reason_length check (char_length(reason) between 3 and 300),
  constraint capability_grants_expiry_check
    check (expires_at is null or expires_at > created_at)
);

create index capability_grants_user_id_idx on public.capability_grants (user_id);
create index capability_grants_agency_id_idx on public.capability_grants (agency_id);
create index capability_grants_capability_key_idx
  on public.capability_grants (capability_key);
create index capability_grants_organization_id_idx
  on public.capability_grants (organization_id)
  where organization_id is not null;
create index capability_grants_granted_by_idx
  on public.capability_grants (granted_by)
  where granted_by is not null;
create unique index capability_grants_active_agency_unique
  on public.capability_grants (user_id, agency_id, capability_key)
  where scope_kind = 'agency' and revoked_at is null;
create unique index capability_grants_active_organization_unique
  on public.capability_grants (user_id, organization_id, capability_key)
  where scope_kind = 'organization' and revoked_at is null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  email text not null,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  agency_role_key text references public.roles(key) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  client_role_key text references public.roles(key) on delete restrict,
  classification text,
  invited_by uuid not null references public.profiles(user_id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '48 hours'),
  email_sent_at timestamptz,
  accepted_by uuid references public.profiles(user_id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_inviter_idempotency_unique unique (invited_by, idempotency_key),
  constraint invitations_kind_check check (kind in ('internal', 'client')),
  constraint invitations_email_normalized check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and position('@' in email) > 1
  ),
  constraint invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint invitations_classification_check check (
    classification is null
    or classification in ('founder', 'employee', 'external_collaborator', 'contractor')
  ),
  constraint invitations_kind_fields_check check (
    (
      kind = 'internal'
      and organization_id is null
      and agency_role_key is not null
      and department_id is not null
      and client_role_key is null
      and classification is not null
    )
    or (
      kind = 'client'
      and organization_id is not null
      and agency_role_key is null
      and department_id is null
      and client_role_key is not null
      and classification is null
    )
  ),
  constraint invitations_expiry_check check (expires_at > created_at),
  constraint invitations_acceptance_consistency check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_by is null and accepted_at is null)
  )
);

create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_agency_id_idx on public.invitations (agency_id);
create index invitations_organization_id_idx
  on public.invitations (organization_id)
  where organization_id is not null;
create index invitations_agency_role_key_idx
  on public.invitations (agency_role_key)
  where agency_role_key is not null;
create index invitations_department_id_idx
  on public.invitations (department_id)
  where department_id is not null;
create index invitations_client_role_key_idx
  on public.invitations (client_role_key)
  where client_role_key is not null;
create index invitations_accepted_by_idx
  on public.invitations (accepted_by)
  where accepted_by is not null;
create unique index invitations_pending_internal_unique
  on public.invitations (agency_id, email)
  where kind = 'internal' and status = 'pending';
create unique index invitations_pending_client_unique
  on public.invitations (organization_id, email)
  where kind = 'client' and status = 'pending';

create table public.domain_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid,
  resource_type text not null,
  resource_id uuid not null,
  agency_id uuid references public.agencies(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint domain_events_type_format
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint domain_events_resource_type_format
    check (resource_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint domain_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index domain_events_actor_id_idx on public.domain_events (actor_id);
create index domain_events_agency_id_idx on public.domain_events (agency_id);
create index domain_events_organization_id_idx
  on public.domain_events (organization_id)
  where organization_id is not null;
create index domain_events_resource_idx
  on public.domain_events (resource_type, resource_id, occurred_at);
create unique index domain_events_actor_idempotency_unique
  on public.domain_events (actor_id, event_type, idempotency_key)
  where idempotency_key is not null;

create table public.audit_events (
  event_id uuid primary key default gen_random_uuid(),
  domain_event_id uuid not null unique
    references public.domain_events(event_id) on delete restrict,
  event_type text not null,
  actor_id uuid,
  resource_type text not null,
  resource_id uuid not null,
  agency_id uuid references public.agencies(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  correlation_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_events_type_format
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint audit_events_resource_type_format
    check (resource_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint audit_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index audit_events_actor_id_idx on public.audit_events (actor_id);
create index audit_events_agency_id_idx on public.audit_events (agency_id);
create index audit_events_organization_id_idx
  on public.audit_events (organization_id)
  where organization_id is not null;
create index audit_events_resource_idx
  on public.audit_events (resource_type, resource_id, occurred_at);

insert into public.roles (key, context, display_name, description) values
  ('agency_director', 'agency', 'Agency Director', 'Operational director with explicit administrative capabilities.'),
  ('project_manager', 'agency', 'Project Manager', 'Project manager limited to assigned resource scope.'),
  ('contributor', 'agency', 'Contributor', 'Operational contributor without member administration authority.'),
  ('client_admin', 'client', 'Client Admin', 'Client organization member prepared for future administration without invite authority in MVP.'),
  ('client_reviewer', 'client', 'Client Reviewer', 'Client organization member prepared for explicit project review assignments.'),
  ('client_viewer', 'client', 'Client Viewer', 'Read-only client organization member.');

insert into public.capabilities (key, description, resource_scope_required) values
  ('agency.member.invite', 'Invite an internal agency member.', false),
  ('agency.member.manage', 'Manage an internal agency membership.', false),
  ('agency.member.role.assign', 'Assign an operational agency role.', false),
  ('agency.member.department.assign', 'Assign organizational department metadata.', false),
  ('organization.create', 'Create a minimal organization.', false),
  ('organization.view', 'View an organization only when membership or resource scope also permits it.', true),
  ('organization.manage', 'Manage an organization only within authorized scope.', true),
  ('client_user.invite', 'Invite a client user within authorized organization scope.', true),
  ('client_user.revoke', 'Archive a client membership within authorized organization scope.', true),
  ('audit.view', 'View audit history within authorized agency scope.', false);

insert into public.role_capabilities (role_key, capability_key)
select 'agency_director', key from public.capabilities;

insert into public.role_capabilities (role_key, capability_key) values
  ('client_admin', 'organization.view'),
  ('client_reviewer', 'organization.view'),
  ('client_viewer', 'organization.view');

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function app_private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();
create trigger agencies_set_updated_at
before update on public.agencies
for each row execute function app_private.set_updated_at();
create trigger departments_set_updated_at
before update on public.departments
for each row execute function app_private.set_updated_at();
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function app_private.set_updated_at();
create trigger agency_memberships_set_updated_at
before update on public.agency_memberships
for each row execute function app_private.set_updated_at();
create trigger client_memberships_set_updated_at
before update on public.client_memberships
for each row execute function app_private.set_updated_at();
create trigger invitations_set_updated_at
before update on public.invitations
for each row execute function app_private.set_updated_at();

create or replace function app_private.enforce_agency_membership_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_context text;
  department_agency uuid;
  department_category text;
begin
  select r.context into role_context
  from public.roles as r
  where r.key = new.role_key;

  select d.agency_id, d.category
  into department_agency, department_category
  from public.departments as d
  where d.id = new.department_id and d.is_active;

  if role_context is distinct from 'agency'
    or department_agency is distinct from new.agency_id
    or (new.role_key = 'agency_director' and department_category is distinct from 'direction')
    or (new.role_key <> 'agency_director' and department_category is distinct from 'operations') then
    raise exception using errcode = '22023', message = 'invalid_agency_role_department';
  end if;

  return new;
end;
$$;

revoke execute on function app_private.enforce_agency_membership_metadata()
  from public, anon, authenticated;

create trigger agency_memberships_validate_metadata
before insert or update of agency_id, role_key, department_id
on public.agency_memberships
for each row execute function app_private.enforce_agency_membership_metadata();

create or replace function app_private.enforce_client_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.roles as r
    where r.key = new.role_key and r.context = 'client'
  ) then
    raise exception using errcode = '22023', message = 'invalid_client_role';
  end if;
  return new;
end;
$$;

revoke execute on function app_private.enforce_client_membership_role()
  from public, anon, authenticated;

create trigger client_memberships_validate_role
before insert or update of role_key on public.client_memberships
for each row execute function app_private.enforce_client_membership_role();

create or replace function app_private.enforce_capability_grant_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope_kind = 'organization' and not exists (
    select 1 from public.organizations as o
    where o.id = new.organization_id and o.agency_id = new.agency_id
  ) then
    raise exception using errcode = '22023', message = 'invalid_capability_scope';
  end if;
  return new;
end;
$$;

revoke execute on function app_private.enforce_capability_grant_scope()
  from public, anon, authenticated;

create trigger capability_grants_validate_scope
before insert or update of agency_id, scope_kind, organization_id
on public.capability_grants
for each row execute function app_private.enforce_capability_grant_scope();

create or replace function app_private.provision_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function app_private.provision_profile()
  from public, anon, authenticated;

create trigger auth_user_provision_profile
after insert on auth.users
for each row execute function app_private.provision_profile();

insert into public.profiles (user_id)
select u.id from auth.users as u
on conflict (user_id) do nothing;

create or replace function public.has_capability(
  capability_key text,
  agency_scope uuid default null,
  organization_scope uuid default null
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.agency_memberships as am
    join public.role_capabilities as rc on rc.role_key = am.role_key
    where am.user_id = (select auth.uid())
      and am.status = 'active'
      and rc.capability_key = $1
      and ($2 is null or am.agency_id = $2)

    union all

    select 1
    from public.capability_grants as cg
    where cg.user_id = (select auth.uid())
      and cg.capability_key = $1
      and cg.revoked_at is null
      and (cg.expires_at is null or cg.expires_at > now())
      and ($2 is null or cg.agency_id = $2)
      and (
        (cg.scope_kind = 'agency' and $3 is null)
        or (cg.scope_kind = 'agency' and $3 is not null)
        or (cg.scope_kind = 'organization' and cg.organization_id = $3)
      )

    union all

    select 1
    from public.client_memberships as cm
    join public.role_capabilities as rc on rc.role_key = cm.role_key
    where cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and rc.capability_key = $1
      and $3 is not null
      and cm.organization_id = $3
  );
$$;

comment on function public.has_capability(text, uuid, uuid) is
  'Evaluates the current actor. A capability is never a substitute for resource scope.';

create or replace function public.my_capabilities()
returns table (
  capability_key text,
  scope_kind text,
  scope_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct projection.capability_key, projection.scope_kind, projection.scope_id
  from (
    select rc.capability_key, 'agency'::text as scope_kind, am.agency_id as scope_id
    from public.agency_memberships as am
    join public.role_capabilities as rc on rc.role_key = am.role_key
    where am.user_id = (select auth.uid()) and am.status = 'active'

    union all

    select cg.capability_key, cg.scope_kind,
      case when cg.scope_kind = 'agency' then cg.agency_id else cg.organization_id end
    from public.capability_grants as cg
    where cg.user_id = (select auth.uid())
      and cg.revoked_at is null
      and (cg.expires_at is null or cg.expires_at > now())

    union all

    select rc.capability_key, 'organization'::text, cm.organization_id
    from public.client_memberships as cm
    join public.role_capabilities as rc on rc.role_key = cm.role_key
    where cm.user_id = (select auth.uid()) and cm.status = 'active'
  ) as projection
  order by projection.capability_key, projection.scope_kind, projection.scope_id;
$$;

comment on function public.my_capabilities() is
  'UX projection only. RLS and transactional commands remain authoritative.';

create or replace function app_private.emit_event(
  p_event_type text,
  p_actor_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_agency_id uuid,
  p_organization_id uuid,
  p_correlation_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_event_id uuid;
begin
  insert into public.domain_events (
    event_type,
    actor_id,
    resource_type,
    resource_id,
    agency_id,
    organization_id,
    correlation_id,
    idempotency_key,
    payload
  ) values (
    p_event_type,
    p_actor_id,
    p_resource_type,
    p_resource_id,
    p_agency_id,
    p_organization_id,
    p_correlation_id,
    p_idempotency_key,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning event_id into created_event_id;

  insert into public.audit_events (
    domain_event_id,
    event_type,
    actor_id,
    resource_type,
    resource_id,
    agency_id,
    organization_id,
    correlation_id,
    payload
  ) values (
    created_event_id,
    p_event_type,
    p_actor_id,
    p_resource_type,
    p_resource_id,
    p_agency_id,
    p_organization_id,
    p_correlation_id,
    coalesce(p_payload, '{}'::jsonb)
  );

  return created_event_id;
end;
$$;

revoke execute on function app_private.emit_event(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function app_private.create_organization(
  p_name text,
  p_timezone text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_agency uuid;
  created_organization uuid;
  correlation uuid := gen_random_uuid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select am.agency_id into actor_agency
  from public.agency_memberships as am
  where am.user_id = actor
    and am.status = 'active'
    and public.has_capability('organization.create', am.agency_id, null)
  order by am.created_at
  limit 1;

  if actor_agency is null then
    raise exception using errcode = '42501', message = 'organization_create_forbidden';
  end if;

  select de.resource_id into created_organization
  from public.domain_events as de
  where de.actor_id = actor
    and de.event_type = 'organization.created'
    and de.idempotency_key = p_idempotency_key;

  if created_organization is not null then
    return created_organization;
  end if;

  if char_length(btrim(p_name)) not between 1 and 200
    or char_length(btrim(p_timezone)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid_organization_input';
  end if;

  insert into public.organizations (agency_id, name, lifecycle, timezone)
  values (actor_agency, btrim(p_name), 'prospect', btrim(p_timezone))
  returning id into created_organization;

  perform app_private.emit_event(
    'organization.created', actor, 'organization', created_organization,
    actor_agency, created_organization, correlation, p_idempotency_key,
    jsonb_build_object('lifecycle', 'prospect')
  );

  return created_organization;
end;
$$;

create or replace function public.create_organization(
  name text,
  timezone text,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.create_organization($1, $2, $3);
$$;

create or replace function app_private.create_invitation(
  p_kind text,
  p_email text,
  p_agency_role_key text,
  p_department_key text,
  p_classification text,
  p_organization_id uuid,
  p_client_role_key text,
  p_idempotency_key uuid
)
returns table (
  invitation_id uuid,
  normalized_email text,
  invitation_kind text,
  is_replay boolean,
  was_dispatched boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_agency uuid;
  target_department uuid;
  target_department_category text;
  normalized text := lower(btrim(p_email));
  existing public.invitations%rowtype;
  expired_id uuid;
  created_id uuid;
  correlation uuid := gen_random_uuid();
  event_type text;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if char_length(normalized) not between 3 and 320 or position('@' in normalized) <= 1 then
    raise exception using errcode = '22023', message = 'invalid_invitation_email';
  end if;

  select i.* into existing
  from public.invitations as i
  where i.invited_by = actor and i.idempotency_key = p_idempotency_key;

  if found then
    return query select existing.id, existing.email, existing.kind, true,
      existing.email_sent_at is not null;
    return;
  end if;

  if p_kind = 'internal' then
    select am.agency_id into actor_agency
    from public.agency_memberships as am
    where am.user_id = actor
      and am.status = 'active'
      and public.has_capability('agency.member.invite', am.agency_id, null)
    order by am.created_at
    limit 1;

    if actor_agency is null then
      raise exception using errcode = '42501', message = 'internal_invitation_forbidden';
    end if;

    if p_organization_id is not null or p_client_role_key is not null then
      raise exception using errcode = '22023', message = 'invalid_internal_invitation';
    end if;

    if not exists (
      select 1 from public.roles as r
      where r.key = p_agency_role_key and r.context = 'agency'
    ) then
      raise exception using errcode = '22023', message = 'invalid_agency_role';
    end if;

    select d.id, d.category into target_department, target_department_category
    from public.departments as d
    where d.agency_id = actor_agency and d.key = p_department_key and d.is_active;

    if target_department is null
      or (p_agency_role_key = 'agency_director' and target_department_category <> 'direction')
      or (p_agency_role_key <> 'agency_director' and target_department_category <> 'operations')
      or p_classification not in ('founder', 'employee', 'external_collaborator', 'contractor') then
      raise exception using errcode = '22023', message = 'invalid_agency_role_department';
    end if;

    update public.invitations
    set status = 'expired'
    where kind = 'internal'
      and agency_id = actor_agency
      and email = normalized
      and status = 'pending'
      and expires_at <= now()
    returning id into expired_id;

    if expired_id is not null then
      perform app_private.emit_event(
        'auth.invitation.expired', actor, 'invitation', expired_id,
        actor_agency, null, correlation, null,
        jsonb_build_object('kind', 'internal')
      );
      correlation := gen_random_uuid();
    end if;

    select i.* into existing
    from public.invitations as i
    where i.kind = 'internal'
      and i.agency_id = actor_agency
      and i.email = normalized
      and i.status = 'pending';

    if found then
      if existing.agency_role_key is distinct from p_agency_role_key
        or existing.department_id is distinct from target_department
        or existing.classification is distinct from p_classification then
        raise exception using errcode = '23505', message = 'pending_invitation_conflict';
      end if;
      return query select existing.id, existing.email, existing.kind, true,
        existing.email_sent_at is not null;
      return;
    end if;

    insert into public.invitations (
      kind, email, agency_id, agency_role_key, department_id,
      classification, invited_by, idempotency_key
    ) values (
      'internal', normalized, actor_agency, p_agency_role_key, target_department,
      p_classification, actor, p_idempotency_key
    ) returning id into created_id;
    event_type := 'agency.member.invited';
  elsif p_kind = 'client' then
    select o.agency_id into actor_agency
    from public.organizations as o
    where o.id = p_organization_id
      and o.archived_at is null
      and public.has_capability('client_user.invite', o.agency_id, o.id);

    if actor_agency is null then
      raise exception using errcode = '42501', message = 'client_invitation_forbidden';
    end if;

    if p_agency_role_key is not null or p_department_key is not null or p_classification is not null then
      raise exception using errcode = '22023', message = 'invalid_client_invitation';
    end if;

    if not exists (
      select 1 from public.roles as r
      where r.key = p_client_role_key and r.context = 'client'
    ) then
      raise exception using errcode = '22023', message = 'invalid_client_role';
    end if;

    update public.invitations
    set status = 'expired'
    where kind = 'client'
      and organization_id = p_organization_id
      and email = normalized
      and status = 'pending'
      and expires_at <= now()
    returning id into expired_id;

    if expired_id is not null then
      perform app_private.emit_event(
        'auth.invitation.expired', actor, 'invitation', expired_id,
        actor_agency, p_organization_id, correlation, null,
        jsonb_build_object('kind', 'client')
      );
      correlation := gen_random_uuid();
    end if;

    select i.* into existing
    from public.invitations as i
    where i.kind = 'client'
      and i.organization_id = p_organization_id
      and i.email = normalized
      and i.status = 'pending';

    if found then
      if existing.client_role_key is distinct from p_client_role_key then
        raise exception using errcode = '23505', message = 'pending_invitation_conflict';
      end if;
      return query select existing.id, existing.email, existing.kind, true,
        existing.email_sent_at is not null;
      return;
    end if;

    insert into public.invitations (
      kind, email, agency_id, organization_id, client_role_key,
      invited_by, idempotency_key
    ) values (
      'client', normalized, actor_agency, p_organization_id, p_client_role_key,
      actor, p_idempotency_key
    ) returning id into created_id;
    event_type := 'client.member.invited';
  else
    raise exception using errcode = '22023', message = 'invalid_invitation_kind';
  end if;

  perform app_private.emit_event(
    event_type, actor, 'invitation', created_id, actor_agency, p_organization_id,
    correlation, p_idempotency_key, jsonb_build_object('kind', p_kind)
  );

  return query select created_id, normalized, p_kind, false, false;
end;
$$;

create or replace function public.create_invitation(
  kind text,
  email text,
  agency_role_key text default null,
  department_key text default null,
  classification text default null,
  organization_id uuid default null,
  client_role_key text default null,
  idempotency_key uuid default gen_random_uuid()
)
returns table (
  invitation_id uuid,
  normalized_email text,
  invitation_kind text,
  is_replay boolean,
  was_dispatched boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from app_private.create_invitation($1, $2, $3, $4, $5, $6, $7, $8);
$$;

create or replace function app_private.mark_invitation_dispatched(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations%rowtype;
  correlation uuid := gen_random_uuid();
begin
  select i.* into invitation
  from public.invitations as i
  where i.id = p_invitation_id
  for update;

  if not found or invitation.status <> 'pending' then
    raise exception using errcode = '22023', message = 'invitation_not_pending';
  end if;

  if invitation.email_sent_at is null then
    update public.invitations
    set email_sent_at = now()
    where id = invitation.id;

    perform app_private.emit_event(
      case invitation.kind
        when 'internal' then 'agency.member.invitation_dispatched'
        else 'client.member.invitation_dispatched'
      end,
      invitation.invited_by,
      'invitation',
      invitation.id,
      invitation.agency_id,
      invitation.organization_id,
      correlation,
      null,
      jsonb_build_object('kind', invitation.kind)
    );
  end if;
end;
$$;

create or replace function public.mark_invitation_dispatched(invitation_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.mark_invitation_dispatched($1);
$$;

create or replace function app_private.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
  invitation public.invitations%rowtype;
  membership_id uuid;
  correlation uuid := gen_random_uuid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select lower(u.email) into actor_email
  from auth.users as u
  where u.id = actor and u.email_confirmed_at is not null;

  if actor_email is null then
    raise exception using errcode = '42501', message = 'verified_email_required';
  end if;

  select i.* into invitation
  from public.invitations as i
  where i.id = p_invitation_id
  for update;

  if not found
    or invitation.email <> actor_email
    or invitation.status not in ('pending', 'accepted') then
    raise exception using errcode = '42501', message = 'invitation_not_available';
  end if;

  if invitation.status = 'accepted' then
    if invitation.accepted_by is distinct from actor then
      raise exception using errcode = '42501', message = 'invitation_already_used';
    end if;
    if invitation.kind = 'internal' then
      select am.id into membership_id
      from public.agency_memberships as am
      where am.user_id = actor and am.agency_id = invitation.agency_id;
    else
      select cm.id into membership_id
      from public.client_memberships as cm
      where cm.user_id = actor and cm.organization_id = invitation.organization_id;
    end if;
    return membership_id;
  end if;

  if invitation.expires_at <= now() then
    raise exception using errcode = '22023', message = 'invitation_expired';
  end if;

  if invitation.kind = 'internal' then
    insert into public.agency_memberships (
      user_id, agency_id, role_key, department_id, status, classification
    ) values (
      actor, invitation.agency_id, invitation.agency_role_key,
      invitation.department_id, 'active', invitation.classification
    )
    on conflict (user_id, agency_id) do update
      set role_key = excluded.role_key,
          department_id = excluded.department_id,
          status = 'active',
          classification = excluded.classification,
          archived_at = null
      where public.agency_memberships.status in ('invited', 'archived')
    returning id into membership_id;
  else
    insert into public.client_memberships (
      user_id, organization_id, role_key, status, invited_by
    ) values (
      actor, invitation.organization_id, invitation.client_role_key,
      'active', invitation.invited_by
    )
    on conflict (user_id, organization_id) do update
      set role_key = excluded.role_key,
          status = 'active',
          invited_by = excluded.invited_by,
          archived_at = null
      where public.client_memberships.status in ('invited', 'archived')
    returning id into membership_id;
  end if;

  if membership_id is null then
    raise exception using errcode = '23505', message = 'active_membership_exists';
  end if;

  update public.invitations
  set status = 'accepted', accepted_by = actor, accepted_at = now()
  where id = invitation.id;

  perform app_private.emit_event(
    'auth.invitation.accepted', actor, 'invitation', invitation.id,
    invitation.agency_id, invitation.organization_id, correlation, null,
    jsonb_build_object('kind', invitation.kind, 'membership_id', membership_id)
  );

  return membership_id;
end;
$$;

create or replace function public.accept_invitation(invitation_id uuid)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.accept_invitation($1);
$$;

create or replace function app_private.update_agency_membership(
  p_membership_id uuid,
  p_role_key text,
  p_department_key text,
  p_classification text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  membership public.agency_memberships%rowtype;
  department uuid;
  department_category text;
  changed_fields text[] := array[]::text[];
  correlation uuid := gen_random_uuid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select am.* into membership
  from public.agency_memberships as am
  where am.id = p_membership_id
  for update;

  if not found
    or membership.user_id = actor
    or not public.has_capability('agency.member.manage', membership.agency_id, null)
    or not public.has_capability('agency.member.role.assign', membership.agency_id, null)
    or not public.has_capability('agency.member.department.assign', membership.agency_id, null) then
    raise exception using errcode = '42501', message = 'membership_update_forbidden';
  end if;

  if exists (
    select 1 from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'agency.member.updated'
      and de.idempotency_key = p_idempotency_key
  ) then
    return membership.id;
  end if;

  if not exists (
    select 1 from public.roles as r where r.key = p_role_key and r.context = 'agency'
  ) or p_classification not in ('founder', 'employee', 'external_collaborator', 'contractor') then
    raise exception using errcode = '22023', message = 'invalid_membership_input';
  end if;

  select d.id, d.category into department, department_category
  from public.departments as d
  where d.agency_id = membership.agency_id and d.key = p_department_key and d.is_active;

  if department is null
    or (p_role_key = 'agency_director' and department_category <> 'direction')
    or (p_role_key <> 'agency_director' and department_category <> 'operations') then
    raise exception using errcode = '22023', message = 'invalid_agency_role_department';
  end if;

  if membership.role_key is distinct from p_role_key then
    changed_fields := array_append(changed_fields, 'role');
  end if;
  if membership.department_id is distinct from department then
    changed_fields := array_append(changed_fields, 'department');
  end if;
  if membership.classification is distinct from p_classification then
    changed_fields := array_append(changed_fields, 'classification');
  end if;

  update public.agency_memberships
  set role_key = p_role_key,
      department_id = department,
      classification = p_classification
  where id = membership.id;

  perform app_private.emit_event(
    'agency.member.updated', actor, 'agency_membership', membership.id,
    membership.agency_id, null, correlation, p_idempotency_key,
    jsonb_build_object('changed_fields', to_jsonb(changed_fields))
  );

  return membership.id;
end;
$$;

create or replace function public.update_agency_membership(
  membership_id uuid,
  role_key text,
  department_key text,
  classification text,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.update_agency_membership($1, $2, $3, $4, $5);
$$;

create or replace function app_private.archive_client_membership(
  p_membership_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  membership public.client_memberships%rowtype;
  membership_agency uuid;
  correlation uuid := gen_random_uuid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select cm.* into membership
  from public.client_memberships as cm
  where cm.id = p_membership_id
  for update;

  if found then
    select o.agency_id into membership_agency
    from public.organizations as o
    where o.id = membership.organization_id;
  end if;

  if not found
    or membership.user_id = actor
    or not public.has_capability(
      'client_user.revoke', membership_agency, membership.organization_id
    ) then
    raise exception using errcode = '42501', message = 'client_membership_archive_forbidden';
  end if;

  if membership.status <> 'archived' then
    update public.client_memberships
    set status = 'archived', archived_at = now()
    where id = membership.id;

    perform app_private.emit_event(
      'client.member.revoked', actor, 'client_membership', membership.id,
      membership_agency, membership.organization_id, correlation,
      p_idempotency_key, '{}'::jsonb
    );
  end if;

  return membership.id;
end;
$$;

create or replace function public.archive_client_membership(
  membership_id uuid,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.archive_client_membership($1, $2);
$$;

revoke all on function app_private.create_organization(text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.create_invitation(
  text, text, text, text, text, uuid, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.mark_invitation_dispatched(uuid)
  from public, anon, authenticated;
revoke all on function app_private.accept_invitation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.update_agency_membership(uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.archive_client_membership(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.has_capability(text, uuid, uuid)
  from public, anon;
revoke execute on function public.my_capabilities() from public, anon;
revoke execute on function public.create_organization(text, text, uuid)
  from public, anon;
revoke execute on function public.create_invitation(
  text, text, text, text, text, uuid, text, uuid
) from public, anon;
revoke execute on function public.mark_invitation_dispatched(uuid)
  from public, anon, authenticated;
revoke execute on function public.accept_invitation(uuid) from public, anon;
revoke execute on function public.update_agency_membership(uuid, text, text, text, uuid)
  from public, anon;
revoke execute on function public.archive_client_membership(uuid, uuid)
  from public, anon;

grant execute on function public.has_capability(text, uuid, uuid) to authenticated;
grant execute on function public.my_capabilities() to authenticated;
grant execute on function public.create_organization(text, text, uuid) to authenticated;
grant execute on function public.create_invitation(
  text, text, text, text, text, uuid, text, uuid
) to authenticated;
grant execute on function public.mark_invitation_dispatched(uuid) to service_role;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.update_agency_membership(uuid, text, text, text, uuid)
  to authenticated;
grant execute on function public.archive_client_membership(uuid, uuid)
  to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.agencies enable row level security;
alter table public.agencies force row level security;
alter table public.departments enable row level security;
alter table public.departments force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.capabilities enable row level security;
alter table public.capabilities force row level security;
alter table public.role_capabilities enable row level security;
alter table public.role_capabilities force row level security;
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.agency_memberships enable row level security;
alter table public.agency_memberships force row level security;
alter table public.client_memberships enable row level security;
alter table public.client_memberships force row level security;
alter table public.capability_grants enable row level security;
alter table public.capability_grants force row level security;
alter table public.invitations enable row level security;
alter table public.invitations force row level security;
alter table public.domain_events enable row level security;
alter table public.domain_events force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

create policy profiles_select_self on public.profiles
for select to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_update_self on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy agencies_select_member on public.agencies
for select to authenticated
using (exists (
  select 1 from public.agency_memberships as am
  where am.agency_id = agencies.id
    and am.user_id = (select auth.uid())
    and am.status = 'active'
));

create policy departments_select_member on public.departments
for select to authenticated
using (exists (
  select 1 from public.agency_memberships as am
  where am.agency_id = departments.agency_id
    and am.user_id = (select auth.uid())
    and am.status = 'active'
));

create policy roles_select_authenticated on public.roles
for select to authenticated
using ((select auth.uid()) is not null);

create policy capabilities_select_authenticated on public.capabilities
for select to authenticated
using ((select auth.uid()) is not null);

create policy role_capabilities_select_authenticated on public.role_capabilities
for select to authenticated
using ((select auth.uid()) is not null);

create policy organizations_select_authorized on public.organizations
for select to authenticated
using (
  archived_at is null
  and public.has_capability('organization.view', agency_id, id)
);

create policy agency_memberships_select_self on public.agency_memberships
for select to authenticated
using ((select auth.uid()) = user_id);

create policy client_memberships_select_self on public.client_memberships
for select to authenticated
using ((select auth.uid()) = user_id);

create policy capability_grants_select_self on public.capability_grants
for select to authenticated
using ((select auth.uid()) = user_id);

create policy invitations_select_involved on public.invitations
for select to authenticated
using (
  invited_by = (select auth.uid())
  or accepted_by = (select auth.uid())
);

create policy domain_events_select_auditor on public.domain_events
for select to authenticated
using (public.has_capability('audit.view', agency_id, organization_id));

create policy audit_events_select_auditor on public.audit_events
for select to authenticated
using (public.has_capability('audit.view', agency_id, organization_id));

revoke all on all tables in schema public from anon, authenticated;

grant select on public.roles, public.capabilities, public.role_capabilities
  to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant select on public.agencies, public.departments, public.organizations,
  public.agency_memberships, public.client_memberships,
  public.capability_grants, public.invitations,
  public.domain_events, public.audit_events
  to authenticated;

comment on table public.capability_grants is
  'Server-managed additional authority. Organization-scoped grants never imply access to other organizations.';
comment on table public.domain_events is
  'Canonical append-only business event foundation. Browser roles cannot insert, update or delete.';
comment on table public.audit_events is
  'Canonical immutable audit projection generated server-side with its domain event.';
comment on table public.invitations is
  'Authorized invitation intent. Auth email dispatch is performed by the server-only Edge Function.';
