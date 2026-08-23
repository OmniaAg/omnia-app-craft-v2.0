-- Phase 4 - Projects, Work, Tasks & My Space.
-- Project scope is explicit. Organization/client membership never implies
-- Project access, and internal work stays unavailable to client actors.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  name text not null,
  description text,
  status text not null default 'planning',
  start_date date,
  target_end_date date,
  timezone text,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint projects_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint projects_description_length check (description is null or char_length(description) <= 8000),
  constraint projects_status_check check (status in ('planning', 'active', 'on_hold', 'completed', 'archived')),
  constraint projects_timezone_length check (timezone is null or char_length(btrim(timezone)) between 1 and 80),
  constraint projects_date_order check (start_date is null or target_end_date is null or target_end_date >= start_date),
  constraint projects_archive_consistency check ((status = 'archived') = (archived_at is not null))
);

create index projects_brand_status_created_idx
  on public.projects (brand_id, status, created_at desc, id);
create index projects_created_by_idx on public.projects (created_by);
create index projects_active_target_end_idx
  on public.projects (target_end_date, id)
  where archived_at is null and target_end_date is not null;

create table public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  member_type text not null,
  responsibility text not null,
  status text not null default 'active',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint project_memberships_project_user_unique unique (project_id, user_id),
  constraint project_memberships_member_type_check check (member_type in ('internal', 'client')),
  constraint project_memberships_responsibility_check check (
    (member_type = 'internal' and responsibility in ('lead', 'member'))
    or (member_type = 'client' and responsibility = 'client_member')
  ),
  constraint project_memberships_status_check check (status in ('active', 'revoked')),
  constraint project_memberships_revoke_consistency check ((status = 'revoked') = (revoked_at is not null))
);

create index project_memberships_project_status_idx
  on public.project_memberships (project_id, status, responsibility, user_id);
create index project_memberships_user_active_idx
  on public.project_memberships (user_id, project_id)
  where status = 'active';
create index project_memberships_created_by_idx on public.project_memberships (created_by);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null,
  description text,
  due_date date,
  status text not null default 'planned',
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint milestones_name_length check (char_length(btrim(name)) between 1 and 160),
  constraint milestones_description_length check (description is null or char_length(description) <= 4000),
  constraint milestones_status_check check (status in ('planned', 'in_progress', 'completed', 'closed', 'archived')),
  constraint milestones_sort_order_check check (sort_order >= 0),
  constraint milestones_archive_consistency check ((status = 'archived') = (archived_at is not null))
);

create index milestones_project_status_sort_idx
  on public.milestones (project_id, status, sort_order, due_date, id);
create index milestones_created_by_idx on public.milestones (created_by);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  milestone_id uuid references public.milestones(id) on delete restrict,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'normal',
  visibility text not null default 'internal',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  constraint work_items_title_length check (char_length(btrim(title)) between 1 and 240),
  constraint work_items_description_length check (description is null or char_length(description) <= 12000),
  constraint work_items_status_check check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  constraint work_items_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint work_items_visibility_check check (visibility = 'internal'),
  constraint work_items_completion_consistency check ((status = 'done') = (completed_at is not null))
);

create index work_items_project_status_created_idx
  on public.work_items (project_id, status, created_at desc, id)
  where archived_at is null;
create index work_items_project_due_idx
  on public.work_items (project_id, due_at, id)
  where archived_at is null and due_at is not null;
create index work_items_milestone_id_idx
  on public.work_items (milestone_id)
  where milestone_id is not null;
create index work_items_created_by_idx on public.work_items (created_by);

create table public.work_item_assignees (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  assigned_by uuid not null references public.profiles(user_id) on delete restrict,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint work_item_assignees_item_user_unique unique (work_item_id, user_id)
);

create index work_item_assignees_work_active_idx
  on public.work_item_assignees (work_item_id, user_id)
  where revoked_at is null;
create index work_item_assignees_user_active_idx
  on public.work_item_assignees (user_id, work_item_id)
  where revoked_at is null;
create index work_item_assignees_assigned_by_idx on public.work_item_assignees (assigned_by);

create table public.work_item_comments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  author_id uuid not null references public.profiles(user_id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  archived_at timestamptz,
  constraint work_item_comments_body_length check (char_length(btrim(body)) between 1 and 8000)
);

create index work_item_comments_work_created_idx
  on public.work_item_comments (work_item_id, created_at, id)
  where archived_at is null;
create index work_item_comments_author_id_idx on public.work_item_comments (author_id);

create table public.work_item_events (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  domain_event_id uuid not null unique references public.domain_events(event_id) on delete restrict,
  event_type text not null,
  actor_id uuid not null references public.profiles(user_id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint work_item_events_type_check check (event_type in (
    'work.created', 'work.assigned', 'work.reassigned', 'work.status_changed',
    'work.completed', 'work.archived', 'work.comment.created'
  )),
  constraint work_item_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index work_item_events_work_occurred_idx
  on public.work_item_events (work_item_id, occurred_at desc, id);
create index work_item_events_actor_id_idx on public.work_item_events (actor_id);

create table public.personal_work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  item_type text not null default 'todo',
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint personal_work_items_type_check check (item_type in ('todo', 'note', 'reminder')),
  constraint personal_work_items_title_length check (char_length(btrim(title)) between 1 and 240),
  constraint personal_work_items_description_length check (description is null or char_length(description) <= 8000),
  constraint personal_work_items_status_check check (status in ('open', 'done', 'archived')),
  constraint personal_work_items_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint personal_work_items_completion_consistency check ((status = 'done') = (completed_at is not null)),
  constraint personal_work_items_archive_consistency check ((status = 'archived') = (archived_at is not null))
);

create index personal_work_items_user_status_due_idx
  on public.personal_work_items (user_id, status, due_at, id)
  where archived_at is null;

insert into public.capabilities (key, description, resource_scope_required) values
  ('project.view', 'View a Project only with explicit Project scope or an administrative capability.', true),
  ('project.create', 'Create a Project under an authorized active Brand.', true),
  ('project.manage', 'Manage an authorized Project.', true),
  ('project.member.manage', 'Add or revoke explicit Project memberships.', true),
  ('milestone.manage', 'Create and update milestones in an authorized Project.', true),
  ('work.view', 'View internal work in an authorized Project.', true),
  ('work.create', 'Create internal work in an authorized Project.', true),
  ('work.assign', 'Assign internal Project work to active internal members.', true),
  ('work.transition', 'Transition authorized work through the controlled state machine.', true),
  ('work.archive', 'Archive internal Project work.', true),
  ('work.comment.create', 'Comment on internal work that the actor can access.', true),
  ('personal_work.manage', 'Manage only the current internal actor personal work.', true);

insert into public.role_capabilities (role_key, capability_key)
select 'agency_director', key
from public.capabilities
where key in (
  'project.view', 'project.create', 'project.manage', 'project.member.manage',
  'milestone.manage', 'work.view', 'work.create', 'work.assign',
  'work.transition', 'work.archive', 'work.comment.create', 'personal_work.manage'
);

insert into public.role_capabilities (role_key, capability_key) values
  ('project_manager', 'project.view'),
  ('project_manager', 'project.manage'),
  ('project_manager', 'project.member.manage'),
  ('project_manager', 'milestone.manage'),
  ('project_manager', 'work.view'),
  ('project_manager', 'work.create'),
  ('project_manager', 'work.assign'),
  ('project_manager', 'work.transition'),
  ('project_manager', 'work.archive'),
  ('project_manager', 'work.comment.create'),
  ('project_manager', 'personal_work.manage'),
  ('contributor', 'project.view'),
  ('contributor', 'work.view'),
  ('contributor', 'work.transition'),
  ('contributor', 'work.comment.create'),
  ('contributor', 'personal_work.manage');

create trigger projects_set_updated_at
before update on public.projects
for each row execute function app_private.set_updated_at();

create trigger project_memberships_set_updated_at
before update on public.project_memberships
for each row execute function app_private.set_updated_at();

create trigger milestones_set_updated_at
before update on public.milestones
for each row execute function app_private.set_updated_at();

create trigger work_items_set_updated_at
before update on public.work_items
for each row execute function app_private.set_updated_at();

create trigger personal_work_items_set_updated_at
before update on public.personal_work_items
for each row execute function app_private.set_updated_at();

create or replace function app_private.is_internal_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.agency_memberships as am
    where am.user_id = (select auth.uid())
      and am.status = 'active'
  );
$$;

create or replace function app_private.project_permission(
  p_project_id uuid,
  p_capability_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_agency uuid;
  target_organization uuid;
  actor_role text;
begin
  if actor is null then return false; end if;

  select o.agency_id, o.id
  into target_agency, target_organization
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  where p.id = p_project_id;

  if target_agency is null
    or not public.has_capability(p_capability_key, target_agency, target_organization) then
    return false;
  end if;

  select am.role_key into actor_role
  from public.agency_memberships as am
  where am.user_id = actor
    and am.agency_id = target_agency
    and am.status = 'active';

  if actor_role = 'agency_director' then return true; end if;

  return exists (
    select 1
    from public.project_memberships as pm
    where pm.project_id = p_project_id
      and pm.user_id = actor
      and pm.member_type = 'internal'
      and pm.status = 'active'
  );
end;
$$;

create or replace function app_private.can_manage_project_members(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.project_permission($1, 'project.member.manage')
    and (
      exists (
        select 1
        from public.projects as p
        join public.brands as b on b.id = p.brand_id
        join public.organizations as o on o.id = b.organization_id
        join public.agency_memberships as am on am.agency_id = o.agency_id
        where p.id = $1
          and am.user_id = (select auth.uid())
          and am.status = 'active'
          and am.role_key = 'agency_director'
      )
      or exists (
        select 1
        from public.project_memberships as pm
        where pm.project_id = $1
          and pm.user_id = (select auth.uid())
          and pm.member_type = 'internal'
          and pm.responsibility = 'lead'
          and pm.status = 'active'
      )
    );
$$;

create or replace function app_private.can_read_work_item(p_work_item_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_project uuid;
  actor_role text;
begin
  select wi.project_id into target_project
  from public.work_items as wi
  where wi.id = p_work_item_id;

  if target_project is null
    or not app_private.project_permission(target_project, 'work.view') then
    return false;
  end if;

  select am.role_key into actor_role
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  join public.agency_memberships as am on am.agency_id = o.agency_id
  where p.id = target_project
    and am.user_id = actor
    and am.status = 'active';

  if actor_role in ('agency_director', 'project_manager') then return true; end if;

  return actor_role = 'contributor' and exists (
    select 1
    from public.work_item_assignees as wia
    where wia.work_item_id = p_work_item_id
      and wia.user_id = actor
      and wia.revoked_at is null
  );
end;
$$;

create or replace function app_private.record_work_event(
  p_work_item_id uuid,
  p_event_type text,
  p_actor_id uuid,
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
  target_agency uuid;
  target_organization uuid;
  created_event uuid;
begin
  select o.agency_id, o.id
  into target_agency, target_organization
  from public.work_items as wi
  join public.projects as p on p.id = wi.project_id
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  where wi.id = p_work_item_id;

  created_event := app_private.emit_event(
    p_event_type, p_actor_id, 'work_item', p_work_item_id,
    target_agency, target_organization, p_correlation_id,
    p_idempotency_key, coalesce(p_payload, '{}'::jsonb)
  );

  insert into public.work_item_events (
    work_item_id, domain_event_id, event_type, actor_id, payload
  ) values (
    p_work_item_id, created_event, p_event_type, p_actor_id,
    coalesce(p_payload, '{}'::jsonb)
  );

  return created_event;
end;
$$;

revoke all on function app_private.is_internal_actor()
  from public, anon, authenticated, service_role;
revoke all on function app_private.project_permission(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_manage_project_members(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_read_work_item(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.record_work_event(uuid, text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- RLS needs caller-executable predicates. Public wrappers expose only booleans;
-- app_private remains entirely unusable by browser roles.
create or replace function public.is_internal_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app_private.is_internal_actor(); $$;

create or replace function public.project_access_allowed(project_id uuid, capability_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app_private.project_permission($1, $2); $$;

create or replace function public.work_item_access_allowed(work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app_private.can_read_work_item($1); $$;

revoke execute on function public.is_internal_actor() from public, anon;
revoke execute on function public.project_access_allowed(uuid, text) from public, anon;
revoke execute on function public.work_item_access_allowed(uuid) from public, anon;
grant execute on function public.is_internal_actor() to authenticated;
grant execute on function public.project_access_allowed(uuid, text) to authenticated;
grant execute on function public.work_item_access_allowed(uuid) to authenticated;

create or replace function app_private.create_project(
  p_brand_id uuid,
  p_name text,
  p_description text,
  p_status text,
  p_start_date date,
  p_target_end_date date,
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
  target_brand public.brands%rowtype;
  target_organization public.organizations%rowtype;
  target_agency uuid;
  actor_role text;
  created_id uuid;
  membership_id uuid;
  correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created_id
  from public.domain_events as de
  where de.actor_id = actor
    and de.event_type = 'project.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;

  select * into target_brand from public.brands where id = p_brand_id;
  select * into target_organization
  from public.organizations where id = target_brand.organization_id;
  target_agency := target_organization.agency_id;

  if actor is null
    or target_brand.id is null
    or target_brand.status <> 'active'
    or target_organization.lifecycle <> 'active_client'
    or not public.has_capability('project.create', target_agency, target_organization.id) then
    raise exception using errcode = '42501', message = 'project_create_forbidden';
  end if;

  if p_status not in ('planning', 'active', 'on_hold')
    or char_length(btrim(p_name)) not between 1 and 200
    or (p_start_date is not null and p_target_end_date is not null and p_target_end_date < p_start_date) then
    raise exception using errcode = '22023', message = 'invalid_project_input';
  end if;

  insert into public.projects (
    brand_id, name, description, status, start_date, target_end_date,
    timezone, created_by
  ) values (
    target_brand.id, btrim(p_name), nullif(btrim(p_description), ''), p_status,
    p_start_date, p_target_end_date, nullif(btrim(p_timezone), ''), actor
  ) returning id into created_id;

  select am.role_key into actor_role
  from public.agency_memberships as am
  where am.user_id = actor and am.agency_id = target_agency and am.status = 'active';

  if actor_role <> 'agency_director' then
    insert into public.project_memberships (
      project_id, user_id, member_type, responsibility, created_by
    ) values (created_id, actor, 'internal', 'lead', actor)
    returning id into membership_id;
  end if;

  perform app_private.emit_event(
    'project.created', actor, 'project', created_id, target_agency,
    target_organization.id, correlation, p_idempotency_key,
    jsonb_build_object('brand_id', target_brand.id, 'initial_membership_id', membership_id)
  );

  return created_id;
end;
$$;

create or replace function public.create_project(
  brand_id uuid,
  name text,
  description text,
  status text,
  start_date date,
  target_end_date date,
  timezone text,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.create_project($1,$2,$3,$4,$5,$6,$7,$8);
$$;

create or replace function app_private.archive_project(
  p_project_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.projects%rowtype;
  target_agency uuid;
  target_organization uuid;
  correlation uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.domain_events as de
    where de.actor_id = actor and de.event_type = 'project.archived'
      and de.idempotency_key = p_idempotency_key
  ) then return p_project_id; end if;

  select * into target from public.projects where id = p_project_id for update;
  if target.id is null
    or not app_private.project_permission(target.id, 'project.manage') then
    raise exception using errcode = '42501', message = 'project_archive_forbidden';
  end if;
  if target.status = 'archived' then return target.id; end if;

  select o.agency_id, o.id into target_agency, target_organization
  from public.brands as b
  join public.organizations as o on o.id = b.organization_id
  where b.id = target.brand_id;

  update public.projects
  set status = 'archived', archived_at = now()
  where id = target.id;

  perform app_private.emit_event(
    'project.archived', actor, 'project', target.id, target_agency,
    target_organization, correlation, p_idempotency_key, '{}'::jsonb
  );
  return target.id;
end;
$$;

create or replace function public.archive_project(project_id uuid, idempotency_key uuid)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.archive_project($1,$2); $$;

create or replace function app_private.add_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_member_type text,
  p_responsibility text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_project public.projects%rowtype;
  target_agency uuid;
  target_organization uuid;
  created_id uuid;
  correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created_id
  from public.domain_events as de
  where de.actor_id = actor
    and de.event_type = 'project.member.added'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;

  select * into target_project from public.projects where id = p_project_id for update;
  select o.agency_id, o.id into target_agency, target_organization
  from public.brands as b
  join public.organizations as o on o.id = b.organization_id
  where b.id = target_project.brand_id;

  if actor is null or p_user_id = actor
    or target_project.id is null or target_project.archived_at is not null
    or not app_private.can_manage_project_members(target_project.id) then
    raise exception using errcode = '42501', message = 'project_member_manage_forbidden';
  end if;

  if p_member_type = 'internal' then
    if p_responsibility not in ('lead', 'member') or not exists (
      select 1 from public.agency_memberships as am
      where am.user_id = p_user_id and am.agency_id = target_agency
        and am.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'invalid_internal_project_member';
    end if;
  elsif p_member_type = 'client' then
    if p_responsibility <> 'client_member' or not exists (
      select 1 from public.client_memberships as cm
      where cm.user_id = p_user_id and cm.organization_id = target_organization
        and cm.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'invalid_client_project_member';
    end if;
  else
    raise exception using errcode = '22023', message = 'invalid_project_member_type';
  end if;

  insert into public.project_memberships (
    project_id, user_id, member_type, responsibility, status,
    created_by, revoked_at
  ) values (
    target_project.id, p_user_id, p_member_type, p_responsibility,
    'active', actor, null
  )
  on conflict (project_id, user_id) do update
  set member_type = excluded.member_type,
      responsibility = excluded.responsibility,
      status = 'active',
      revoked_at = null,
      created_by = actor
  returning id into created_id;

  perform app_private.emit_event(
    'project.member.added', actor, 'project_membership', created_id,
    target_agency, target_organization, correlation, p_idempotency_key,
    jsonb_build_object('project_id', target_project.id, 'user_id', p_user_id,
      'member_type', p_member_type, 'responsibility', p_responsibility)
  );
  return created_id;
end;
$$;

create or replace function public.add_project_member(
  project_id uuid,
  user_id uuid,
  member_type text,
  responsibility text,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.add_project_member($1,$2,$3,$4,$5); $$;

create or replace function app_private.revoke_project_member(
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
  target public.project_memberships%rowtype;
  target_agency uuid;
  target_organization uuid;
  correlation uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.domain_events as de
    where de.actor_id = actor and de.event_type = 'project.member.revoked'
      and de.idempotency_key = p_idempotency_key
  ) then return p_membership_id; end if;

  select * into target
  from public.project_memberships where id = p_membership_id for update;

  if target.id is null or target.user_id = actor
    or not app_private.can_manage_project_members(target.project_id) then
    raise exception using errcode = '42501', message = 'project_member_revoke_forbidden';
  end if;
  if target.status = 'revoked' then return target.id; end if;

  select o.agency_id, o.id into target_agency, target_organization
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  where p.id = target.project_id;

  update public.project_memberships
  set status = 'revoked', revoked_at = now()
  where id = target.id;

  perform app_private.emit_event(
    'project.member.revoked', actor, 'project_membership', target.id,
    target_agency, target_organization, correlation, p_idempotency_key,
    jsonb_build_object('project_id', target.project_id, 'user_id', target.user_id)
  );
  return target.id;
end;
$$;

create or replace function public.revoke_project_member(
  membership_id uuid,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.revoke_project_member($1,$2); $$;

create or replace function app_private.create_milestone(
  p_project_id uuid,
  p_name text,
  p_description text,
  p_due_date date,
  p_sort_order integer,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  created_id uuid;
  correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created_id
  from public.domain_events as de
  where de.actor_id = actor and de.event_type = 'milestone.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;

  if actor is null or not app_private.project_permission(p_project_id, 'milestone.manage')
    or exists (select 1 from public.projects where id = p_project_id and archived_at is not null) then
    raise exception using errcode = '42501', message = 'milestone_create_forbidden';
  end if;
  if char_length(btrim(p_name)) not between 1 and 160 or p_sort_order < 0 then
    raise exception using errcode = '22023', message = 'invalid_milestone_input';
  end if;

  insert into public.milestones (
    project_id, name, description, due_date, sort_order, created_by
  ) values (
    p_project_id, btrim(p_name), nullif(btrim(p_description), ''),
    p_due_date, p_sort_order, actor
  ) returning id into created_id;

  perform app_private.emit_event(
    'milestone.created', actor, 'milestone', created_id,
    (select o.agency_id from public.projects p join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id where p.id=p_project_id),
    (select b.organization_id from public.projects p join public.brands b on b.id=p.brand_id where p.id=p_project_id),
    correlation, p_idempotency_key, jsonb_build_object('project_id', p_project_id)
  );
  return created_id;
end;
$$;

create or replace function public.create_milestone(
  project_id uuid,
  name text,
  description text,
  due_date date,
  sort_order integer,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.create_milestone($1,$2,$3,$4,$5,$6); $$;

create or replace function app_private.update_milestone(
  p_milestone_id uuid,
  p_name text,
  p_description text,
  p_due_date date,
  p_status text,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.milestones%rowtype;
  correlation uuid := gen_random_uuid();
begin
  select * into target from public.milestones where id = p_milestone_id for update;
  if target.id is null
    or not app_private.project_permission(target.project_id, 'milestone.manage')
    or exists (
      select 1 from public.projects as p
      where p.id = target.project_id and p.archived_at is not null
    ) then
    raise exception using errcode = '42501', message = 'milestone_update_forbidden';
  end if;
  if p_status not in ('planned', 'in_progress', 'completed', 'closed', 'archived')
    or char_length(btrim(p_name)) not between 1 and 160 or p_sort_order < 0 then
    raise exception using errcode = '22023', message = 'invalid_milestone_input';
  end if;

  update public.milestones
  set name = btrim(p_name), description = nullif(btrim(p_description), ''),
      due_date = p_due_date, status = p_status, sort_order = p_sort_order,
      archived_at = case when p_status = 'archived' then coalesce(archived_at, now()) else null end
  where id = target.id;

  perform app_private.emit_event(
    'milestone.updated', actor, 'milestone', target.id,
    (select o.agency_id from public.projects p join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id where p.id=target.project_id),
    (select b.organization_id from public.projects p join public.brands b on b.id=p.brand_id where p.id=target.project_id),
    correlation, null, jsonb_build_object('project_id', target.project_id, 'status', p_status)
  );
  return target.id;
end;
$$;

create or replace function public.update_milestone(
  milestone_id uuid,
  name text,
  description text,
  due_date date,
  status text,
  sort_order integer
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.update_milestone($1,$2,$3,$4,$5,$6); $$;

revoke all on function app_private.create_project(uuid,text,text,text,date,date,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.archive_project(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.add_project_member(uuid,uuid,text,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.revoke_project_member(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.create_milestone(uuid,text,text,date,integer,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.update_milestone(uuid,text,text,date,text,integer)
  from public, anon, authenticated, service_role;

create or replace function app_private.create_work_item(
  p_project_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due_local timestamp without time zone,
  p_milestone_id uuid,
  p_assignee_ids uuid[],
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  created_id uuid;
  assignee uuid;
  correlation uuid := gen_random_uuid();
  normalized_assignees uuid[];
begin
  select de.resource_id into created_id
  from public.domain_events as de
  where de.actor_id = actor and de.event_type = 'work.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;

  if actor is null or not app_private.project_permission(p_project_id, 'work.create')
    or exists (select 1 from public.projects where id = p_project_id and archived_at is not null) then
    raise exception using errcode = '42501', message = 'work_create_forbidden';
  end if;
  if char_length(btrim(p_title)) not between 1 and 240
    or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'invalid_work_item_input';
  end if;
  if p_milestone_id is not null and not exists (
    select 1 from public.milestones as m
    where m.id = p_milestone_id and m.project_id = p_project_id
      and m.archived_at is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_work_item_milestone';
  end if;

  select coalesce(array_agg(distinct candidate order by candidate), '{}'::uuid[])
  into normalized_assignees
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) as candidate;

  foreach assignee in array normalized_assignees loop
    if not exists (
      select 1 from public.project_memberships as pm
      where pm.project_id = p_project_id and pm.user_id = assignee
        and pm.member_type = 'internal' and pm.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'assignee_not_active_project_member';
    end if;
  end loop;

  insert into public.work_items (
    project_id, milestone_id, title, description, priority,
    due_at, created_by
  ) values (
    p_project_id, p_milestone_id, btrim(p_title),
    nullif(btrim(p_description), ''), p_priority,
    case when p_due_local is null then null
      else p_due_local at time zone 'America/Mexico_City' end,
    actor
  ) returning id into created_id;

  foreach assignee in array normalized_assignees loop
    insert into public.work_item_assignees (
      work_item_id, user_id, assigned_by
    ) values (created_id, assignee, actor);
  end loop;

  perform app_private.record_work_event(
    created_id, 'work.created', actor, correlation, p_idempotency_key,
    jsonb_build_object('project_id', p_project_id, 'priority', p_priority)
  );
  if cardinality(normalized_assignees) > 0 then
    perform app_private.record_work_event(
      created_id, 'work.assigned', actor, correlation, null,
      jsonb_build_object('from', jsonb_build_array(), 'to', to_jsonb(normalized_assignees))
    );
  end if;
  return created_id;
end;
$$;

create or replace function public.create_work_item(
  project_id uuid,
  title text,
  description text,
  priority text,
  due_local timestamp without time zone,
  milestone_id uuid,
  assignee_ids uuid[],
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.create_work_item($1,$2,$3,$4,$5,$6,$7,$8); $$;

create or replace function app_private.assign_work_item(
  p_work_item_id uuid,
  p_assignee_ids uuid[],
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.work_items%rowtype;
  old_assignees uuid[];
  new_assignees uuid[];
  assignee uuid;
  event_name text;
  correlation uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.domain_events as de
    where de.actor_id = actor
      and de.event_type in ('work.assigned', 'work.reassigned')
      and de.resource_id = p_work_item_id
      and de.idempotency_key = p_idempotency_key
  ) then return p_work_item_id; end if;

  select * into target from public.work_items where id = p_work_item_id for update;
  if target.id is null or target.archived_at is not null
    or not app_private.project_permission(target.project_id, 'work.assign') then
    raise exception using errcode = '42501', message = 'work_assign_forbidden';
  end if;

  select coalesce(array_agg(distinct candidate order by candidate), '{}'::uuid[])
  into new_assignees
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) as candidate;
  if cardinality(new_assignees) = 0 then
    raise exception using errcode = '22023', message = 'work_requires_assignee';
  end if;

  foreach assignee in array new_assignees loop
    if not exists (
      select 1 from public.project_memberships as pm
      where pm.project_id = target.project_id and pm.user_id = assignee
        and pm.member_type = 'internal' and pm.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'assignee_not_active_project_member';
    end if;
  end loop;

  select coalesce(array_agg(wia.user_id order by wia.user_id), '{}'::uuid[])
  into old_assignees
  from public.work_item_assignees as wia
  where wia.work_item_id = target.id and wia.revoked_at is null;

  if old_assignees = new_assignees then return target.id; end if;

  update public.work_item_assignees
  set revoked_at = now()
  where work_item_id = target.id and revoked_at is null
    and not (user_id = any(new_assignees));

  foreach assignee in array new_assignees loop
    insert into public.work_item_assignees (
      work_item_id, user_id, assigned_by, assigned_at, revoked_at
    ) values (target.id, assignee, actor, now(), null)
    on conflict (work_item_id, user_id) do update
    set assigned_by = actor, assigned_at = now(), revoked_at = null;
  end loop;

  event_name := case when cardinality(old_assignees) = 0
    then 'work.assigned' else 'work.reassigned' end;
  perform app_private.record_work_event(
    target.id, event_name, actor, correlation, p_idempotency_key,
    jsonb_build_object('from', to_jsonb(old_assignees), 'to', to_jsonb(new_assignees))
  );
  return target.id;
end;
$$;

create or replace function public.assign_work_item(
  work_item_id uuid,
  assignee_ids uuid[],
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.assign_work_item($1,$2,$3); $$;

create or replace function app_private.transition_work_item(
  p_work_item_id uuid,
  p_status text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.work_items%rowtype;
  actor_role text;
  event_name text;
  correlation uuid := gen_random_uuid();
  valid_transition boolean := false;
begin
  if exists (
    select 1 from public.domain_events as de
    where de.actor_id = actor
      and de.event_type in ('work.status_changed', 'work.completed')
      and de.resource_id = p_work_item_id
      and de.idempotency_key = p_idempotency_key
  ) then return p_work_item_id; end if;

  select * into target from public.work_items where id = p_work_item_id for update;
  if target.id is null or target.archived_at is not null
    or not app_private.project_permission(target.project_id, 'work.transition') then
    raise exception using errcode = '42501', message = 'work_transition_forbidden';
  end if;

  select am.role_key into actor_role
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  join public.agency_memberships as am on am.agency_id = o.agency_id
  where p.id = target.project_id and am.user_id = actor and am.status = 'active';

  if actor_role = 'contributor' and not exists (
    select 1 from public.work_item_assignees as wia
    where wia.work_item_id = target.id and wia.user_id = actor
      and wia.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'work_transition_forbidden';
  end if;

  if p_status = target.status then return target.id; end if;
  valid_transition := case target.status
    when 'todo' then p_status in ('in_progress', 'cancelled')
    when 'in_progress' then p_status in ('todo', 'blocked', 'done', 'cancelled')
    when 'blocked' then p_status in ('in_progress', 'cancelled')
    when 'done' then p_status = 'in_progress'
    when 'cancelled' then p_status = 'todo'
    else false
  end;
  if not valid_transition then
    raise exception using errcode = '22023', message = 'invalid_work_transition';
  end if;

  update public.work_items
  set status = p_status,
      completed_at = case when p_status = 'done' then now() else null end
  where id = target.id;

  event_name := case when p_status = 'done' then 'work.completed'
    else 'work.status_changed' end;
  perform app_private.record_work_event(
    target.id, event_name, actor, correlation, p_idempotency_key,
    jsonb_build_object('from', target.status, 'to', p_status)
  );
  return target.id;
end;
$$;

create or replace function public.transition_work_item(
  work_item_id uuid,
  status text,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.transition_work_item($1,$2,$3); $$;

create or replace function app_private.archive_work_item(
  p_work_item_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.work_items%rowtype;
  correlation uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.domain_events as de
    where de.actor_id = actor and de.event_type = 'work.archived'
      and de.resource_id = p_work_item_id
      and de.idempotency_key = p_idempotency_key
  ) then return p_work_item_id; end if;
  select * into target from public.work_items where id = p_work_item_id for update;
  if target.id is null or not app_private.project_permission(target.project_id, 'work.archive') then
    raise exception using errcode = '42501', message = 'work_archive_forbidden';
  end if;
  if target.archived_at is not null then return target.id; end if;
  update public.work_items set archived_at = now() where id = target.id;
  perform app_private.record_work_event(
    target.id, 'work.archived', actor, correlation, p_idempotency_key,
    jsonb_build_object('status', target.status)
  );
  return target.id;
end;
$$;

create or replace function public.archive_work_item(
  work_item_id uuid,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.archive_work_item($1,$2); $$;

create or replace function app_private.create_work_item_comment(
  p_work_item_id uuid,
  p_body text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.work_items%rowtype;
  created_id uuid;
  created_event uuid;
  target_agency uuid;
  target_organization uuid;
  correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created_id
  from public.domain_events as de
  where de.actor_id = actor and de.event_type = 'work.comment.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;

  select * into target from public.work_items where id = p_work_item_id;
  if target.id is null or target.archived_at is not null
    or not app_private.can_read_work_item(target.id)
    or not app_private.project_permission(target.project_id, 'work.comment.create') then
    raise exception using errcode = '42501', message = 'work_comment_forbidden';
  end if;
  if char_length(btrim(p_body)) not between 1 and 8000 then
    raise exception using errcode = '22023', message = 'invalid_work_comment';
  end if;

  insert into public.work_item_comments (work_item_id, author_id, body)
  values (target.id, actor, btrim(p_body)) returning id into created_id;

  select o.agency_id, o.id into target_agency, target_organization
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  where p.id = target.project_id;

  created_event := app_private.emit_event(
    'work.comment.created', actor, 'work_item_comment', created_id,
    target_agency, target_organization, correlation, p_idempotency_key,
    jsonb_build_object('work_item_id', target.id)
  );
  insert into public.work_item_events (
    work_item_id, domain_event_id, event_type, actor_id, payload
  ) values (
    target.id, created_event, 'work.comment.created', actor,
    jsonb_build_object('comment_id', created_id)
  );
  return created_id;
end;
$$;

create or replace function public.create_work_item_comment(
  work_item_id uuid,
  body text,
  idempotency_key uuid
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$ select app_private.create_work_item_comment($1,$2,$3); $$;

revoke all on function app_private.create_work_item(uuid,text,text,text,timestamp without time zone,uuid,uuid[],uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.assign_work_item(uuid,uuid[],uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.transition_work_item(uuid,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.archive_work_item(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.create_work_item_comment(uuid,text,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_personal_work_item(
  item_type text,
  title text,
  description text,
  priority text,
  due_local timestamp without time zone
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  created_id uuid;
begin
  if actor is null or not app_private.is_internal_actor()
    or not public.has_capability('personal_work.manage', null, null) then
    raise exception using errcode = '42501', message = 'personal_work_create_forbidden';
  end if;
  if item_type not in ('todo', 'note', 'reminder')
    or priority not in ('low', 'normal', 'high', 'urgent')
    or char_length(btrim(title)) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid_personal_work_input';
  end if;

  insert into public.personal_work_items (
    user_id, item_type, title, description, priority, due_at
  ) values (
    actor, item_type, btrim(title), nullif(btrim(description), ''), priority,
    case when due_local is null then null
      else due_local at time zone 'America/Mexico_City' end
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.update_personal_work_item(
  personal_item_id uuid,
  item_type text,
  title text,
  description text,
  status text,
  priority text,
  due_local timestamp without time zone
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.personal_work_items%rowtype;
begin
  select * into target
  from public.personal_work_items where id = personal_item_id for update;
  if actor is null or target.id is null or target.user_id <> actor
    or not app_private.is_internal_actor()
    or not public.has_capability('personal_work.manage', null, null) then
    raise exception using errcode = '42501', message = 'personal_work_update_forbidden';
  end if;
  if item_type not in ('todo', 'note', 'reminder')
    or status not in ('open', 'done')
    or priority not in ('low', 'normal', 'high', 'urgent')
    or char_length(btrim(title)) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid_personal_work_input';
  end if;

  update public.personal_work_items
  set item_type = update_personal_work_item.item_type,
      title = btrim(update_personal_work_item.title),
      description = nullif(btrim(update_personal_work_item.description), ''),
      status = update_personal_work_item.status,
      priority = update_personal_work_item.priority,
      due_at = case when due_local is null then null
        else due_local at time zone 'America/Mexico_City' end,
      completed_at = case when update_personal_work_item.status = 'done'
        then coalesce(target.completed_at, now()) else null end,
      archived_at = null
  where id = target.id;
  return target.id;
end;
$$;

create or replace function public.archive_personal_work_item(personal_item_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.personal_work_items%rowtype;
begin
  select * into target
  from public.personal_work_items where id = personal_item_id for update;
  if actor is null or target.id is null or target.user_id <> actor
    or not app_private.is_internal_actor()
    or not public.has_capability('personal_work.manage', null, null) then
    raise exception using errcode = '42501', message = 'personal_work_archive_forbidden';
  end if;
  if target.status <> 'archived' then
    update public.personal_work_items
    set status = 'archived', completed_at = null, archived_at = now()
    where id = target.id;
  end if;
  return target.id;
end;
$$;

create or replace function public.project_brand_options()
returns table (
  brand_id uuid,
  brand_name text,
  organization_id uuid,
  organization_name text,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, o.id, o.name, coalesce(b.timezone, o.timezone)
  from public.brands as b
  join public.organizations as o on o.id = b.organization_id
  where (select auth.uid()) is not null
    and app_private.is_internal_actor()
    and b.status = 'active'
    and o.lifecycle = 'active_client'
    and public.has_capability('project.create', o.agency_id, o.id)
  order by o.name, b.name, b.id;
$$;

create or replace function public.list_projects(
  search_text text default '',
  status_filter text default '',
  page_limit integer default 20,
  page_offset integer default 0
)
returns table (
  project_id uuid,
  project_name text,
  project_description text,
  project_status text,
  start_date date,
  target_end_date date,
  brand_id uuid,
  brand_name text,
  organization_id uuid,
  organization_name text,
  lead_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_internal_actor() then
    raise exception using errcode = '42501', message = 'project_list_forbidden';
  end if;
  if page_limit not between 1 and 100 or page_offset < 0
    or (status_filter <> '' and status_filter not in ('planning','active','on_hold','completed','archived')) then
    raise exception using errcode = '22023', message = 'invalid_project_list_input';
  end if;

  return query
  select p.id, p.name, p.description, p.status, p.start_date, p.target_end_date,
    b.id, b.name, o.id, o.name,
    lead.display_name,
    count(*) over ()
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  left join lateral (
    select coalesce(pr.display_name, au.email, pm.user_id::text) as display_name
    from public.project_memberships as pm
    left join public.profiles as pr on pr.user_id = pm.user_id
    left join auth.users as au on au.id = pm.user_id
    where pm.project_id = p.id and pm.status = 'active'
      and pm.member_type = 'internal' and pm.responsibility = 'lead'
    order by pm.created_at, pm.id
    limit 1
  ) as lead on true
  where app_private.project_permission(p.id, 'project.view')
    and (
      (status_filter = '' and p.archived_at is null)
      or p.status = status_filter
    )
    and (
      btrim(search_text) = ''
      or p.name ilike '%' || btrim(search_text) || '%'
      or b.name ilike '%' || btrim(search_text) || '%'
      or o.name ilike '%' || btrim(search_text) || '%'
    )
  order by p.created_at desc, p.id desc
  limit page_limit offset page_offset;
end;
$$;

create or replace function public.project_detail(project_id uuid)
returns table (
  project_name text,
  project_description text,
  project_status text,
  start_date date,
  target_end_date date,
  timezone text,
  brand_id uuid,
  brand_name text,
  organization_id uuid,
  organization_name text,
  responsibility text,
  can_manage_members boolean,
  can_manage_milestones boolean,
  can_create_work boolean,
  can_assign_work boolean,
  can_archive_project boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.project_permission(project_id, 'project.view') then
    raise exception using errcode = '42501', message = 'project_detail_forbidden';
  end if;
  return query
  select p.name, p.description, p.status, p.start_date, p.target_end_date,
    coalesce(p.timezone, b.timezone, o.timezone), b.id, b.name, o.id, o.name,
    pm.responsibility,
    app_private.can_manage_project_members(p.id),
    app_private.project_permission(p.id, 'milestone.manage'),
    app_private.project_permission(p.id, 'work.create'),
    app_private.project_permission(p.id, 'work.assign'),
    app_private.project_permission(p.id, 'project.manage')
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  left join public.project_memberships as pm
    on pm.project_id = p.id and pm.user_id = (select auth.uid()) and pm.status = 'active'
  where p.id = project_detail.project_id;
end;
$$;

create or replace function public.project_members(project_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  display_name text,
  email text,
  member_type text,
  responsibility text,
  status text,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.project_permission(project_id, 'project.view') then
    raise exception using errcode = '42501', message = 'project_members_forbidden';
  end if;
  return query
  select pm.id, pm.user_id, coalesce(pr.display_name, au.email, pm.user_id::text),
    au.email::text, pm.member_type, pm.responsibility, pm.status, pm.revoked_at
  from public.project_memberships as pm
  left join public.profiles as pr on pr.user_id = pm.user_id
  left join auth.users as au on au.id = pm.user_id
  where pm.project_id = project_members.project_id
  order by (pm.status = 'active') desc, pm.member_type, pm.responsibility, pm.created_at;
end;
$$;

create or replace function public.project_member_candidates(project_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  member_type text,
  suggested_responsibility text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_agency uuid;
  target_organization uuid;
begin
  if not app_private.can_manage_project_members(project_id) then
    raise exception using errcode = '42501', message = 'project_member_candidates_forbidden';
  end if;
  select o.agency_id, o.id into target_agency, target_organization
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  where p.id = project_id;

  return query
  select candidates.user_id, candidates.display_name, candidates.email,
    candidates.member_type, candidates.suggested_responsibility
  from (
    select am.user_id, coalesce(pr.display_name, au.email, am.user_id::text) as display_name,
      au.email::text as email, 'internal'::text as member_type,
      case when am.role_key = 'project_manager' then 'lead' else 'member' end::text as suggested_responsibility
    from public.agency_memberships as am
    left join public.profiles as pr on pr.user_id = am.user_id
    left join auth.users as au on au.id = am.user_id
    where am.agency_id = target_agency and am.status = 'active'

    union all

    select cm.user_id, coalesce(pr.display_name, au.email, cm.user_id::text),
      au.email::text, 'client'::text, 'client_member'::text
    from public.client_memberships as cm
    left join public.profiles as pr on pr.user_id = cm.user_id
    left join auth.users as au on au.id = cm.user_id
    where cm.organization_id = target_organization and cm.status = 'active'
  ) as candidates
  left join public.project_memberships as existing
    on existing.project_id = project_member_candidates.project_id
    and existing.user_id = candidates.user_id and existing.status = 'active'
  where existing.id is null and candidates.user_id <> (select auth.uid())
  order by candidates.member_type, candidates.display_name, candidates.user_id;
end;
$$;

create or replace function public.project_milestones(project_id uuid)
returns table (
  milestone_id uuid,
  milestone_name text,
  description text,
  due_date date,
  status text,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.project_permission(project_id, 'project.view') then
    raise exception using errcode = '42501', message = 'project_milestones_forbidden';
  end if;
  return query
  select m.id, m.name, m.description, m.due_date, m.status, m.sort_order
  from public.milestones as m
  where m.project_id = project_milestones.project_id
  order by (m.status = 'archived'), m.sort_order, m.due_date nulls last, m.id;
end;
$$;

create or replace function public.project_work_items(
  project_id uuid,
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  work_item_id uuid,
  title text,
  description text,
  status text,
  priority text,
  due_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  milestone_id uuid,
  milestone_name text,
  assignee_ids uuid[],
  assignee_names text[],
  can_transition boolean,
  can_assign boolean,
  can_archive boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.project_permission(project_id, 'project.view') then
    raise exception using errcode = '42501', message = 'project_work_forbidden';
  end if;
  if page_limit not between 1 and 100 or page_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid_work_list_input';
  end if;

  return query
  select wi.id, wi.title, wi.description, wi.status, wi.priority,
    wi.due_at, wi.completed_at, wi.archived_at, m.id, m.name,
    coalesce(assignees.user_ids, '{}'::uuid[]),
    coalesce(assignees.display_names, '{}'::text[]),
    app_private.project_permission(wi.project_id, 'work.transition')
      and (
        not exists (
          select 1 from public.projects p2
          join public.brands b2 on b2.id=p2.brand_id
          join public.organizations o2 on o2.id=b2.organization_id
          join public.agency_memberships am2 on am2.agency_id=o2.agency_id
          where p2.id=wi.project_id and am2.user_id=(select auth.uid())
            and am2.status='active' and am2.role_key='contributor'
        )
        or (select auth.uid()) = any(coalesce(assignees.user_ids, '{}'::uuid[]))
      ),
    app_private.project_permission(wi.project_id, 'work.assign'),
    app_private.project_permission(wi.project_id, 'work.archive'),
    count(*) over ()
  from public.work_items as wi
  left join public.milestones as m on m.id = wi.milestone_id
  left join lateral (
    select array_agg(wia.user_id order by wia.user_id) as user_ids,
      array_agg(coalesce(pr.display_name, au.email, wia.user_id::text) order by wia.user_id) as display_names
    from public.work_item_assignees as wia
    left join public.profiles as pr on pr.user_id = wia.user_id
    left join auth.users as au on au.id = wia.user_id
    where wia.work_item_id = wi.id and wia.revoked_at is null
  ) as assignees on true
  where wi.project_id = project_work_items.project_id
    and app_private.can_read_work_item(wi.id)
  order by (wi.archived_at is not null),
    case wi.status when 'blocked' then 0 when 'in_progress' then 1 when 'todo' then 2 when 'done' then 3 else 4 end,
    case wi.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    wi.due_at nulls last, wi.created_at desc, wi.id
  limit page_limit offset page_offset;
end;
$$;

create or replace function public.work_item_comments_list(
  work_item_id uuid,
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  comment_id uuid,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.can_read_work_item(work_item_id) then
    raise exception using errcode = '42501', message = 'work_comments_forbidden';
  end if;
  if page_limit not between 1 and 100 or page_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid_comment_list_input';
  end if;
  return query
  select c.id, c.author_id, coalesce(pr.display_name, au.email, c.author_id::text),
    c.body, c.created_at, c.edited_at
  from public.work_item_comments as c
  left join public.profiles as pr on pr.user_id = c.author_id
  left join auth.users as au on au.id = c.author_id
  where c.work_item_id = work_item_comments_list.work_item_id
    and c.archived_at is null
  order by c.created_at, c.id
  limit page_limit offset page_offset;
end;
$$;

create or replace function public.work_item_event_list(
  work_item_id uuid,
  page_limit integer default 50
)
returns table (
  event_id uuid,
  event_type text,
  actor_id uuid,
  actor_name text,
  payload jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.can_read_work_item(work_item_id) then
    raise exception using errcode = '42501', message = 'work_events_forbidden';
  end if;
  if page_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_event_list_input';
  end if;
  return query
  select we.id, we.event_type, we.actor_id,
    coalesce(pr.display_name, au.email, we.actor_id::text), we.payload, we.occurred_at
  from public.work_item_events as we
  left join public.profiles as pr on pr.user_id = we.actor_id
  left join auth.users as au on au.id = we.actor_id
  where we.work_item_id = work_item_event_list.work_item_id
  order by we.occurred_at desc, we.id desc
  limit page_limit;
end;
$$;

create or replace function public.my_space_items()
returns table (
  item_kind text,
  item_id uuid,
  item_type text,
  title text,
  description text,
  status text,
  priority text,
  due_at timestamptz,
  bucket text,
  project_id uuid,
  project_name text,
  brand_name text,
  organization_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  local_today date := (now() at time zone 'America/Mexico_City')::date;
begin
  if actor is null or not app_private.is_internal_actor() then
    raise exception using errcode = '42501', message = 'my_space_forbidden';
  end if;

  return query
  with unified as (
    select 'project'::text as item_kind, wi.id as item_id, 'assigned'::text as item_type,
      wi.title, wi.description, wi.status, wi.priority, wi.due_at,
      wi.project_id, p.name as project_name, b.name as brand_name, o.name as organization_name
    from public.work_item_assignees as wia
    join public.work_items as wi on wi.id = wia.work_item_id
    join public.projects as p on p.id = wi.project_id
    join public.brands as b on b.id = p.brand_id
    join public.organizations as o on o.id = b.organization_id
    join public.project_memberships as pm
      on pm.project_id = p.id and pm.user_id = actor
      and pm.member_type = 'internal' and pm.status = 'active'
    where wia.user_id = actor and wia.revoked_at is null
      and wi.archived_at is null and wi.status not in ('done', 'cancelled')
      and p.archived_at is null

    union all

    select 'personal', pi.id, pi.item_type, pi.title, pi.description,
      pi.status, pi.priority, pi.due_at, null, null, null, null
    from public.personal_work_items as pi
    where pi.user_id = actor and pi.archived_at is null and pi.status = 'open'
  )
  select u.item_kind, u.item_id, u.item_type, u.title, u.description,
    u.status, u.priority, u.due_at,
    case
      when u.due_at is null then 'no_due_date'
      when (u.due_at at time zone 'America/Mexico_City')::date < local_today then 'overdue'
      when (u.due_at at time zone 'America/Mexico_City')::date = local_today then 'today'
      else 'upcoming'
    end,
    u.project_id, u.project_name, u.brand_name, u.organization_name
  from unified as u
  order by
    case
      when u.due_at is null then 3
      when (u.due_at at time zone 'America/Mexico_City')::date < local_today then 0
      when (u.due_at at time zone 'America/Mexico_City')::date = local_today then 1
      else 2
    end,
    case u.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    u.due_at nulls last, u.item_id;
end;
$$;

create or replace function public.client_project_context(project_id uuid default null)
returns table (
  project_id uuid,
  project_name text,
  project_status text,
  start_date date,
  target_end_date date,
  brand_id uuid,
  brand_name text,
  organization_id uuid,
  organization_name text,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.status, p.start_date, p.target_end_date,
    b.id, b.name, o.id, o.name, coalesce(p.timezone, b.timezone, o.timezone)
  from public.projects as p
  join public.brands as b on b.id = p.brand_id
  join public.organizations as o on o.id = b.organization_id
  join public.project_memberships as pm
    on pm.project_id = p.id and pm.user_id = (select auth.uid())
    and pm.member_type = 'client' and pm.status = 'active'
  join public.client_memberships as cm
    on cm.user_id = pm.user_id and cm.organization_id = o.id and cm.status = 'active'
  where (select auth.uid()) is not null and p.archived_at is null
    and ($1 is null or p.id = $1)
  order by p.name, p.id;
$$;

revoke execute on function public.create_project(uuid,text,text,text,date,date,text,uuid)
  from public, anon;
revoke execute on function public.archive_project(uuid,uuid) from public, anon;
revoke execute on function public.add_project_member(uuid,uuid,text,text,uuid)
  from public, anon;
revoke execute on function public.revoke_project_member(uuid,uuid) from public, anon;
revoke execute on function public.create_milestone(uuid,text,text,date,integer,uuid)
  from public, anon;
revoke execute on function public.update_milestone(uuid,text,text,date,text,integer)
  from public, anon;
revoke execute on function public.create_work_item(uuid,text,text,text,timestamp without time zone,uuid,uuid[],uuid)
  from public, anon;
revoke execute on function public.assign_work_item(uuid,uuid[],uuid) from public, anon;
revoke execute on function public.transition_work_item(uuid,text,uuid) from public, anon;
revoke execute on function public.archive_work_item(uuid,uuid) from public, anon;
revoke execute on function public.create_work_item_comment(uuid,text,uuid)
  from public, anon;
revoke execute on function public.create_personal_work_item(text,text,text,text,timestamp without time zone)
  from public, anon;
revoke execute on function public.update_personal_work_item(uuid,text,text,text,text,text,timestamp without time zone)
  from public, anon;
revoke execute on function public.archive_personal_work_item(uuid) from public, anon;
revoke execute on function public.project_brand_options() from public, anon;
revoke execute on function public.list_projects(text,text,integer,integer) from public, anon;
revoke execute on function public.project_detail(uuid) from public, anon;
revoke execute on function public.project_members(uuid) from public, anon;
revoke execute on function public.project_member_candidates(uuid) from public, anon;
revoke execute on function public.project_milestones(uuid) from public, anon;
revoke execute on function public.project_work_items(uuid,integer,integer) from public, anon;
revoke execute on function public.work_item_comments_list(uuid,integer,integer) from public, anon;
revoke execute on function public.work_item_event_list(uuid,integer) from public, anon;
revoke execute on function public.my_space_items() from public, anon;
revoke execute on function public.client_project_context(uuid) from public, anon;

grant execute on function public.create_project(uuid,text,text,text,date,date,text,uuid)
  to authenticated;
grant execute on function public.archive_project(uuid,uuid) to authenticated;
grant execute on function public.add_project_member(uuid,uuid,text,text,uuid)
  to authenticated;
grant execute on function public.revoke_project_member(uuid,uuid) to authenticated;
grant execute on function public.create_milestone(uuid,text,text,date,integer,uuid)
  to authenticated;
grant execute on function public.update_milestone(uuid,text,text,date,text,integer)
  to authenticated;
grant execute on function public.create_work_item(uuid,text,text,text,timestamp without time zone,uuid,uuid[],uuid)
  to authenticated;
grant execute on function public.assign_work_item(uuid,uuid[],uuid) to authenticated;
grant execute on function public.transition_work_item(uuid,text,uuid) to authenticated;
grant execute on function public.archive_work_item(uuid,uuid) to authenticated;
grant execute on function public.create_work_item_comment(uuid,text,uuid)
  to authenticated;
grant execute on function public.create_personal_work_item(text,text,text,text,timestamp without time zone)
  to authenticated;
grant execute on function public.update_personal_work_item(uuid,text,text,text,text,text,timestamp without time zone)
  to authenticated;
grant execute on function public.archive_personal_work_item(uuid) to authenticated;
grant execute on function public.project_brand_options() to authenticated;
grant execute on function public.list_projects(text,text,integer,integer) to authenticated;
grant execute on function public.project_detail(uuid) to authenticated;
grant execute on function public.project_members(uuid) to authenticated;
grant execute on function public.project_member_candidates(uuid) to authenticated;
grant execute on function public.project_milestones(uuid) to authenticated;
grant execute on function public.project_work_items(uuid,integer,integer) to authenticated;
grant execute on function public.work_item_comments_list(uuid,integer,integer) to authenticated;
grant execute on function public.work_item_event_list(uuid,integer) to authenticated;
grant execute on function public.my_space_items() to authenticated;
grant execute on function public.client_project_context(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.projects force row level security;
alter table public.project_memberships enable row level security;
alter table public.project_memberships force row level security;
alter table public.milestones enable row level security;
alter table public.milestones force row level security;
alter table public.work_items enable row level security;
alter table public.work_items force row level security;
alter table public.work_item_assignees enable row level security;
alter table public.work_item_assignees force row level security;
alter table public.work_item_comments enable row level security;
alter table public.work_item_comments force row level security;
alter table public.work_item_events enable row level security;
alter table public.work_item_events force row level security;
alter table public.personal_work_items enable row level security;
alter table public.personal_work_items force row level security;

create policy projects_select_internal_scope on public.projects
for select to authenticated
using ((select public.project_access_allowed(id, 'project.view')));

create policy project_memberships_select_internal_scope on public.project_memberships
for select to authenticated
using ((select public.project_access_allowed(project_id, 'project.view')));

create policy milestones_select_internal_scope on public.milestones
for select to authenticated
using ((select public.project_access_allowed(project_id, 'project.view')));

create policy work_items_select_internal_scope on public.work_items
for select to authenticated
using ((select public.work_item_access_allowed(id)));

create policy work_item_assignees_select_internal_scope on public.work_item_assignees
for select to authenticated
using ((select public.work_item_access_allowed(work_item_id)));

create policy work_item_comments_select_internal_scope on public.work_item_comments
for select to authenticated
using ((select public.work_item_access_allowed(work_item_id)));

create policy work_item_events_select_internal_scope on public.work_item_events
for select to authenticated
using ((select public.work_item_access_allowed(work_item_id)));

create policy personal_work_items_select_self on public.personal_work_items
for select to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_internal_actor())
);

revoke all on public.projects, public.project_memberships, public.milestones,
  public.work_items, public.work_item_assignees, public.work_item_comments,
  public.work_item_events, public.personal_work_items
  from anon, authenticated;

grant select on public.projects, public.project_memberships, public.milestones,
  public.work_items, public.work_item_assignees, public.work_item_comments,
  public.work_item_events, public.personal_work_items
  to authenticated;

comment on table public.projects is
  'Project belongs canonically to Brand; Organization context is inherited through Brand.';
comment on table public.project_memberships is
  'Explicit Project scope for internal and client actors. Organization membership never substitutes for this row.';
comment on table public.work_items is
  'Canonical internal Project work. visibility remains internal-only during the Phase 4 MVP.';
comment on table public.personal_work_items is
  'Separate self-owned personal organization; it cannot be assigned or converted into Project work.';
comment on column public.projects.start_date is
  'Date-only Project planning boundary; never converted to midnight UTC.';
comment on column public.work_items.due_at is
  'Exact deadline instant. Input RPC interprets due_local in America/Mexico_City.';
comment on function public.my_space_items() is
  'Single-query personal read model. Calendar buckets use America/Mexico_City while due_at remains an absolute instant.';
comment on function public.client_project_context(uuid) is
  'Basic Project projection for explicit client Project members; it never exposes work, comments, assignees or events.';
