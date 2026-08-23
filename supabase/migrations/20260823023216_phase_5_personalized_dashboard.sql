-- Phase 5 - Personalized Dashboard.
-- Widget definitions and defaults live in frontend code. PostgreSQL persists
-- only validated user preferences and remains the authority for ownership,
-- capability-gated widgets and compare-and-swap revisions.

create table public.dashboard_user_configs (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  dashboard_key text not null default 'main',
  registry_version integer not null,
  widget_instances jsonb not null,
  responsive_layouts jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_user_configs_main_only check (dashboard_key = 'main'),
  constraint dashboard_user_configs_registry_positive check (registry_version > 0),
  constraint dashboard_user_configs_instances_array check (jsonb_typeof(widget_instances) = 'array'),
  constraint dashboard_user_configs_layouts_object check (jsonb_typeof(responsive_layouts) = 'object'),
  constraint dashboard_user_configs_revision_positive check (revision > 0)
);

create trigger dashboard_user_configs_set_updated_at
before update on public.dashboard_user_configs
for each row execute function app_private.set_updated_at();

create or replace function app_private.validate_dashboard_config(
  p_registry_version integer,
  p_widget_instances jsonb,
  p_responsive_layouts jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  instance jsonb;
  item jsonb;
  config jsonb;
  layout jsonb;
  instance_id text;
  widget_key text;
  widget_version integer;
  breakpoint text;
  cols integer;
  item_x integer;
  item_y integer;
  item_w integer;
  item_h integer;
  min_width integer;
  max_width integer;
  min_height integer;
  max_height integer;
  seen_instance_ids text[] := '{}'::text[];
  seen_widget_keys text[] := '{}'::text[];
  active_instance_ids text[] := '{}'::text[];
  seen_layout_ids text[];
  instance_count integer;
begin
  if (select auth.uid()) is null or not app_private.is_internal_actor() then
    raise exception using errcode = '42501', message = 'dashboard_actor_forbidden';
  end if;

  if p_registry_version is distinct from 1 then
    raise exception using errcode = '22023', message = 'invalid_dashboard_registry_version';
  end if;

  if jsonb_typeof(p_widget_instances) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_dashboard_widget_instances';
  end if;

  instance_count := jsonb_array_length(p_widget_instances);
  if instance_count > 12 then
    raise exception using errcode = '22023', message = 'dashboard_widget_limit_exceeded';
  end if;

  for instance in select value from jsonb_array_elements(p_widget_instances)
  loop
    if jsonb_typeof(instance) is distinct from 'object'
      or exists (
        select 1 from jsonb_object_keys(instance) as key
        where key not in ('instanceId', 'widgetKey', 'widgetVersion', 'config', 'enabled')
      ) then
      raise exception using errcode = '22023', message = 'invalid_dashboard_widget_instance';
    end if;

    instance_id := instance ->> 'instanceId';
    widget_key := instance ->> 'widgetKey';

    if instance_id is null
      or instance_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'invalid_dashboard_instance_id';
    end if;
    if instance_id = any(seen_instance_ids) then
      raise exception using errcode = '22023', message = 'duplicate_dashboard_instance_id';
    end if;

    if widget_key not in (
      'my-work-summary', 'overdue-work', 'today-work', 'upcoming-work',
      'projects', 'crm-opportunities', 'crm-organizations', 'quick-actions'
    ) then
      raise exception using errcode = '22023', message = 'unknown_dashboard_widget';
    end if;
    if widget_key = any(seen_widget_keys) then
      raise exception using errcode = '22023', message = 'duplicate_dashboard_widget';
    end if;

    if jsonb_typeof(instance -> 'widgetVersion') is distinct from 'number'
      or (instance ->> 'widgetVersion') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'invalid_dashboard_widget_version';
    end if;
    widget_version := (instance ->> 'widgetVersion')::integer;
    if widget_version <> 1 then
      raise exception using errcode = '22023', message = 'invalid_dashboard_widget_version';
    end if;

    if jsonb_typeof(instance -> 'enabled') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'invalid_dashboard_widget_enabled';
    end if;

    config := instance -> 'config';
    if jsonb_typeof(config) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'invalid_dashboard_widget_config';
    end if;
    if widget_key = 'quick-actions' then
      if config <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'invalid_dashboard_widget_config';
      end if;
    else
      if exists (
        select 1 from jsonb_object_keys(config) as key where key <> 'maxItems'
      ) or (
        config ? 'maxItems'
        and (
          jsonb_typeof(config -> 'maxItems') is distinct from 'number'
          or (config ->> 'maxItems') !~ '^[1-6]$'
        )
      ) then
        raise exception using errcode = '22023', message = 'invalid_dashboard_widget_config';
      end if;
    end if;

    if widget_key = 'crm-opportunities'
      and not exists (
        select 1 from public.my_capabilities() as capability
        where capability.capability_key = 'opportunity.view'
      ) then
      raise exception using errcode = '42501', message = 'dashboard_widget_forbidden';
    end if;
    if widget_key = 'crm-organizations'
      and not exists (
        select 1 from public.my_capabilities() as capability
        where capability.capability_key = 'organization.view'
      ) then
      raise exception using errcode = '42501', message = 'dashboard_widget_forbidden';
    end if;

    seen_instance_ids := array_append(seen_instance_ids, instance_id);
    seen_widget_keys := array_append(seen_widget_keys, widget_key);
    if (instance ->> 'enabled')::boolean then
      active_instance_ids := array_append(active_instance_ids, instance_id);
    end if;
  end loop;

  if jsonb_typeof(p_responsive_layouts) is distinct from 'object'
    or not (p_responsive_layouts ?& array['desktop', 'tablet', 'mobile'])
    or exists (
      select 1 from jsonb_object_keys(p_responsive_layouts) as key
      where key not in ('desktop', 'tablet', 'mobile')
    ) then
    raise exception using errcode = '22023', message = 'invalid_dashboard_breakpoints';
  end if;

  foreach breakpoint in array array['desktop', 'tablet', 'mobile']
  loop
    cols := case breakpoint when 'desktop' then 12 when 'tablet' then 6 else 1 end;
    layout := p_responsive_layouts -> breakpoint;
    seen_layout_ids := '{}'::text[];

    if jsonb_typeof(layout) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'invalid_dashboard_layout';
    end if;

    for item in select value from jsonb_array_elements(layout)
    loop
      if jsonb_typeof(item) is distinct from 'object'
        or exists (
          select 1 from jsonb_object_keys(item) as key
          where key not in ('i', 'x', 'y', 'w', 'h')
        ) then
        raise exception using errcode = '22023', message = 'invalid_dashboard_layout_item';
      end if;

      instance_id := item ->> 'i';
      if instance_id is null or not (instance_id = any(active_instance_ids)) then
        raise exception using errcode = '22023', message = 'unknown_dashboard_layout_instance';
      end if;
      if instance_id = any(seen_layout_ids) then
        raise exception using errcode = '22023', message = 'duplicate_dashboard_layout_instance';
      end if;

      if jsonb_typeof(item -> 'x') is distinct from 'number'
        or jsonb_typeof(item -> 'y') is distinct from 'number'
        or jsonb_typeof(item -> 'w') is distinct from 'number'
        or jsonb_typeof(item -> 'h') is distinct from 'number'
        or (item ->> 'x') !~ '^-?[0-9]+$'
        or (item ->> 'y') !~ '^-?[0-9]+$'
        or (item ->> 'w') !~ '^-?[0-9]+$'
        or (item ->> 'h') !~ '^-?[0-9]+$' then
        raise exception using errcode = '22023', message = 'invalid_dashboard_layout_number';
      end if;

      item_x := (item ->> 'x')::integer;
      item_y := (item ->> 'y')::integer;
      item_w := (item ->> 'w')::integer;
      item_h := (item ->> 'h')::integer;
      select value ->> 'widgetKey' into widget_key
      from jsonb_array_elements(p_widget_instances)
      where value ->> 'instanceId' = instance_id;

      min_width := case widget_key
        when 'my-work-summary' then 4
        when 'projects' then 4
        else 3
      end;
      max_width := case widget_key
        when 'my-work-summary' then 12
        when 'projects' then 12
        when 'crm-opportunities' then 12
        when 'crm-organizations' then 12
        else 6
      end;
      min_height := case widget_key when 'projects' then 3 else 2 end;
      max_height := case widget_key
        when 'projects' then 6
        when 'crm-opportunities' then 5
        when 'crm-organizations' then 5
        when 'quick-actions' then 3
        else 4
      end;

      if item_x < 0 or item_y < 0 or item_w < 1 or item_h < min_height
        or item_h > max_height or item_x + item_w > cols then
        raise exception using errcode = '22023', message = 'dashboard_layout_out_of_bounds';
      end if;
      if breakpoint = 'mobile' then
        if item_x <> 0 or item_w <> 1 then
          raise exception using errcode = '22023', message = 'invalid_dashboard_mobile_layout';
        end if;
      elsif item_w < least(min_width, cols) or item_w > least(max_width, cols) then
        raise exception using errcode = '22023', message = 'unsupported_dashboard_widget_size';
      end if;

      seen_layout_ids := array_append(seen_layout_ids, instance_id);
    end loop;

    if coalesce(array_length(seen_layout_ids, 1), 0)
      <> coalesce(array_length(active_instance_ids, 1), 0) then
      raise exception using errcode = '22023', message = 'incomplete_dashboard_layout';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(layout) with ordinality as a(item, position)
      join jsonb_array_elements(layout) with ordinality as b(item, position)
        on a.position < b.position
      where (a.item ->> 'x')::integer < (b.item ->> 'x')::integer + (b.item ->> 'w')::integer
        and (a.item ->> 'x')::integer + (a.item ->> 'w')::integer > (b.item ->> 'x')::integer
        and (a.item ->> 'y')::integer < (b.item ->> 'y')::integer + (b.item ->> 'h')::integer
        and (a.item ->> 'y')::integer + (a.item ->> 'h')::integer > (b.item ->> 'y')::integer
    ) then
      raise exception using errcode = '22023', message = 'overlapping_dashboard_layout';
    end if;
  end loop;
end;
$$;

create or replace function app_private.save_dashboard_config(
  p_expected_revision bigint,
  p_registry_version integer,
  p_widget_instances jsonb,
  p_responsive_layouts jsonb
)
returns setof public.dashboard_user_configs
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.is_internal_actor() then
    raise exception using errcode = '42501', message = 'dashboard_actor_forbidden';
  end if;
  if p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'invalid_dashboard_revision';
  end if;

  perform app_private.validate_dashboard_config(
    p_registry_version,
    p_widget_instances,
    p_responsive_layouts
  );

  if p_expected_revision = 0 then
    return query
    insert into public.dashboard_user_configs (
      user_id, dashboard_key, registry_version, widget_instances,
      responsive_layouts, revision
    ) values (
      actor, 'main', p_registry_version, p_widget_instances,
      p_responsive_layouts, 1
    )
    on conflict (user_id) do nothing
    returning *;
  else
    return query
    update public.dashboard_user_configs
    set registry_version = p_registry_version,
      widget_instances = p_widget_instances,
      responsive_layouts = p_responsive_layouts,
      revision = revision + 1
    where user_id = actor
      and dashboard_key = 'main'
      and revision = p_expected_revision
    returning *;
  end if;

  if found then return; end if;
  raise exception using errcode = '40001', message = 'dashboard_revision_conflict';
end;
$$;

create or replace function public.save_dashboard_config(
  expected_revision bigint,
  registry_version integer,
  widget_instances jsonb,
  responsive_layouts jsonb
)
returns setof public.dashboard_user_configs
language sql
volatile
security definer
set search_path = ''
as $$
  select * from app_private.save_dashboard_config($1, $2, $3, $4);
$$;

create or replace function app_private.reset_dashboard_config(p_expected_revision bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.is_internal_actor() then
    raise exception using errcode = '42501', message = 'dashboard_actor_forbidden';
  end if;
  if p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'invalid_dashboard_revision';
  end if;

  if p_expected_revision = 0 then
    if exists (select 1 from public.dashboard_user_configs where user_id = actor) then
      raise exception using errcode = '40001', message = 'dashboard_revision_conflict';
    end if;
    return true;
  end if;

  delete from public.dashboard_user_configs
  where user_id = actor and dashboard_key = 'main' and revision = p_expected_revision;
  if not found then
    raise exception using errcode = '40001', message = 'dashboard_revision_conflict';
  end if;
  return true;
end;
$$;

create or replace function public.reset_dashboard_config(expected_revision bigint)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.reset_dashboard_config($1);
$$;

create or replace function app_private.dashboard_operational_summary(p_max_items integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not app_private.is_internal_actor() then
    raise exception using errcode = '42501', message = 'dashboard_actor_forbidden';
  end if;
  if p_max_items not between 1 and 6 then
    raise exception using errcode = '22023', message = 'invalid_dashboard_summary_limit';
  end if;

  with work as materialized (
    select * from public.my_space_items()
  ), authorized_projects as materialized (
    select p.id as project_id, p.name as project_name, p.status as project_status,
      p.target_end_date, b.name as brand_name, o.name as organization_name
    from public.projects as p
    join public.brands as b on b.id = p.brand_id
    join public.organizations as o on o.id = b.organization_id
    where p.archived_at is null
      and app_private.project_permission(p.id, 'project.view')
  )
  select jsonb_build_object(
    'work', jsonb_build_object(
      'counts', jsonb_build_object(
        'total', (select count(*) from work),
        'overdue', (select count(*) from work where bucket = 'overdue'),
        'today', (select count(*) from work where bucket = 'today'),
        'upcoming', (select count(*) from work where bucket = 'upcoming'),
        'noDueDate', (select count(*) from work where bucket = 'no_due_date')
      ),
      'nextItems', (
        select coalesce(jsonb_agg(to_jsonb(next_item)), '[]'::jsonb)
        from (
          select item_kind as "itemKind", item_id as "itemId", title, priority,
            due_at as "dueAt", bucket, project_id as "projectId", project_name as "projectName"
          from work limit p_max_items
        ) as next_item
      ),
      'overdueItems', (
        select coalesce(jsonb_agg(to_jsonb(bucket_item)), '[]'::jsonb)
        from (
          select item_kind as "itemKind", item_id as "itemId", title, priority,
            due_at as "dueAt", project_id as "projectId", project_name as "projectName"
          from work where bucket = 'overdue' limit p_max_items
        ) as bucket_item
      ),
      'todayItems', (
        select coalesce(jsonb_agg(to_jsonb(bucket_item)), '[]'::jsonb)
        from (
          select item_kind as "itemKind", item_id as "itemId", title, priority,
            due_at as "dueAt", project_id as "projectId", project_name as "projectName"
          from work where bucket = 'today' limit p_max_items
        ) as bucket_item
      ),
      'upcomingItems', (
        select coalesce(jsonb_agg(to_jsonb(bucket_item)), '[]'::jsonb)
        from (
          select item_kind as "itemKind", item_id as "itemId", title, priority,
            due_at as "dueAt", project_id as "projectId", project_name as "projectName"
          from work where bucket = 'upcoming' limit p_max_items
        ) as bucket_item
      )
    ),
    'projects', jsonb_build_object(
      'activeCount', (select count(*) from authorized_projects where project_status = 'active'),
      'attentionCount', (
        select count(*) from authorized_projects
        where project_status = 'on_hold'
          or (target_end_date < current_date and project_status not in ('completed', 'archived'))
      ),
      'items', (
        select coalesce(jsonb_agg(to_jsonb(project_item)), '[]'::jsonb)
        from (
          select project_id as "projectId", project_name as "projectName",
            project_status as status, target_end_date as "targetEndDate",
            brand_name as "brandName", organization_name as "organizationName"
          from authorized_projects
          order by target_end_date nulls last, project_name, project_id
          limit p_max_items
        ) as project_item
      )
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.dashboard_operational_summary(max_items integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.dashboard_operational_summary($1);
$$;

create or replace function app_private.dashboard_crm_summary(p_max_items integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not app_private.is_internal_actor()
    or not (
      exists (
        select 1 from public.my_capabilities() as capability
        where capability.capability_key in ('opportunity.view', 'organization.view')
      )
    ) then
    raise exception using errcode = '42501', message = 'dashboard_crm_forbidden';
  end if;
  if p_max_items not between 1 and 6 then
    raise exception using errcode = '22023', message = 'invalid_dashboard_summary_limit';
  end if;

  with authorized_organizations as materialized (
    select o.id, o.name, o.lifecycle, o.created_at
    from public.organizations as o
    where public.has_capability('organization.view', o.agency_id, o.id)
  ), authorized_opportunities as materialized (
    select op.id, op.name, op.organization_id, op.stage_key, op.status,
      op.estimated_value, op.currency, op.expected_close_date,
      o.name as organization_name
    from public.opportunities as op
    join public.organizations as o on o.id = op.organization_id
    where op.archived_at is null
      and public.has_capability('opportunity.view', o.agency_id, o.id)
  )
  select jsonb_build_object(
    'opportunities', jsonb_build_object(
      'openCount', (select count(*) from authorized_opportunities where status = 'open'),
      'items', (
        select coalesce(jsonb_agg(to_jsonb(opportunity_item)), '[]'::jsonb)
        from (
          select id as "opportunityId", name, organization_id as "organizationId",
            organization_name as "organizationName", stage_key as "stageKey",
            estimated_value as "estimatedValue", currency,
            expected_close_date as "expectedCloseDate"
          from authorized_opportunities where status = 'open'
          order by expected_close_date nulls last, name, id
          limit p_max_items
        ) as opportunity_item
      )
    ),
    'organizations', jsonb_build_object(
      'totalCount', (select count(*) from authorized_organizations),
      'activeClientCount', (
        select count(*) from authorized_organizations where lifecycle = 'active_client'
      ),
      'items', (
        select coalesce(jsonb_agg(to_jsonb(organization_item)), '[]'::jsonb)
        from (
          select id as "organizationId", name, lifecycle
          from authorized_organizations
          order by created_at desc, id desc
          limit p_max_items
        ) as organization_item
      )
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.dashboard_crm_summary(max_items integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.dashboard_crm_summary($1);
$$;

revoke all on public.dashboard_user_configs from anon, authenticated;
grant select on public.dashboard_user_configs to authenticated;

alter table public.dashboard_user_configs enable row level security;
alter table public.dashboard_user_configs force row level security;

create policy dashboard_user_configs_select_self_internal
on public.dashboard_user_configs
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_internal_actor())
);

revoke execute on function app_private.validate_dashboard_config(integer,jsonb,jsonb)
  from public, anon, authenticated;
revoke execute on function app_private.save_dashboard_config(bigint,integer,jsonb,jsonb)
  from public, anon, authenticated;
revoke execute on function app_private.reset_dashboard_config(bigint)
  from public, anon, authenticated;
revoke execute on function app_private.dashboard_operational_summary(integer)
  from public, anon, authenticated;
revoke execute on function app_private.dashboard_crm_summary(integer)
  from public, anon, authenticated;

revoke execute on function public.save_dashboard_config(bigint,integer,jsonb,jsonb)
  from public, anon;
revoke execute on function public.reset_dashboard_config(bigint)
  from public, anon;
revoke execute on function public.dashboard_operational_summary(integer)
  from public, anon;
revoke execute on function public.dashboard_crm_summary(integer)
  from public, anon;
grant execute on function public.save_dashboard_config(bigint,integer,jsonb,jsonb)
  to authenticated;
grant execute on function public.reset_dashboard_config(bigint)
  to authenticated;
grant execute on function public.dashboard_operational_summary(integer)
  to authenticated;
grant execute on function public.dashboard_crm_summary(integer)
  to authenticated;

comment on table public.dashboard_user_configs is
  'Self-owned Internal App dashboard override. Widget definitions and defaults remain code-owned.';
comment on function public.save_dashboard_config(bigint,integer,jsonb,jsonb) is
  'Validates the code registry contract and saves only the current internal actor row with revision CAS.';
comment on function public.reset_dashboard_config(bigint) is
  'Atomically removes the current actor override so code defaults apply after reload.';
comment on function public.dashboard_operational_summary(integer) is
  'Bounded dashboard read model shared by Work and Projects widgets.';
comment on function public.dashboard_crm_summary(integer) is
  'Capability-scoped CRM dashboard read model. Frontend mounts it only for allowed widgets.';
