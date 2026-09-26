-- Phase 6: Editorial planning specializes canonical Project work.
insert into public.capabilities (key, description, resource_scope_required) values
  ('editorial.view', 'View internal editorial planning in an authorized Project.', true),
  ('editorial.plan', 'Manage editorial cycles and templates in an authorized Project.', true),
  ('editorial.create', 'Create editorial work in an authorized Project.', true),
  ('editorial.update', 'Edit an editorial item before assignment.', true),
  ('editorial.publish_available', 'Offer editorial work to eligible contributors.', true),
  ('editorial.apply', 'Apply for available editorial work in an authorized Project.', true),
  ('editorial.assign', 'Accept an application for editorial work.', true),
  ('editorial.archive', 'Archive editorial planning.', true);

insert into public.role_capabilities (role_key, capability_key)
select 'agency_director', key from public.capabilities where key like 'editorial.%';
insert into public.role_capabilities (role_key, capability_key)
select 'project_manager', key from public.capabilities
where key like 'editorial.%' and key <> 'editorial.apply';
insert into public.role_capabilities (role_key, capability_key) values
  ('contributor', 'editorial.view'), ('contributor', 'editorial.apply');

create table public.content_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  default_channel text check (default_channel in ('instagram','facebook','tiktok','linkedin','youtube','website','other')),
  default_format text check (default_format in ('post','carousel','video','story','article','other')),
  default_brief text check (default_brief is null or char_length(default_brief) <= 12000),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, project_id)
);
create index content_templates_project_active_idx on public.content_templates(project_id, name, id) where archived_at is null;

create table public.editorial_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint editorial_cycles_dates_check check (start_date <= end_date),
  constraint editorial_cycles_archive_check check ((status = 'archived') = (archived_at is not null)),
  unique (id, project_id)
);
create index editorial_cycles_project_dates_idx on public.editorial_cycles(project_id, start_date, end_date) where archived_at is null;

alter table public.work_items add constraint work_items_id_project_unique unique (id, project_id);

create table public.editorial_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  cycle_id uuid not null,
  work_item_id uuid not null unique,
  template_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  brief text check (brief is null or char_length(brief) <= 12000),
  scheduled_date date not null,
  scheduled_time time without time zone,
  channel text not null check (channel in ('instagram','facebook','tiktok','linkedin','youtube','website','other')),
  format text not null check (format in ('post','carousel','video','story','article','other')),
  planning_state text not null default 'planned' check (planning_state in ('planned','available','assigned','cancelled')),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint editorial_items_cycle_project_fk foreign key (cycle_id, project_id) references public.editorial_cycles(id, project_id) on delete restrict,
  constraint editorial_items_work_project_fk foreign key (work_item_id, project_id) references public.work_items(id, project_id) on delete restrict,
  constraint editorial_items_template_project_fk foreign key (template_id, project_id) references public.content_templates(id, project_id) on delete restrict,
  constraint editorial_items_archive_check check ((planning_state = 'cancelled') = (archived_at is not null))
);
create index editorial_items_window_idx on public.editorial_items(scheduled_date, project_id, planning_state, id) where archived_at is null;
create index editorial_items_cycle_idx on public.editorial_items(cycle_id, scheduled_date, id);
create index editorial_items_template_idx on public.editorial_items(template_id) where template_id is not null;

create table public.work_applications (
  id uuid primary key default gen_random_uuid(),
  editorial_item_id uuid not null references public.editorial_items(id) on delete restrict,
  applicant_id uuid not null references public.profiles(user_id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(user_id) on delete restrict,
  constraint work_applications_resolution_check check ((status = 'pending') = (resolved_at is null and resolved_by is null)),
  constraint work_applications_item_applicant_unique unique (editorial_item_id, applicant_id)
);
create unique index work_applications_one_accepted_idx on public.work_applications(editorial_item_id) where status = 'accepted';
create index work_applications_item_status_idx on public.work_applications(editorial_item_id, status, created_at);
create index work_applications_applicant_idx on public.work_applications(applicant_id, status);

create trigger content_templates_updated before update on public.content_templates for each row execute function app_private.set_updated_at();
create trigger editorial_cycles_updated before update on public.editorial_cycles for each row execute function app_private.set_updated_at();
create trigger editorial_items_updated before update on public.editorial_items for each row execute function app_private.set_updated_at();

create function app_private.editorial_permission(p_project_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.project_permission($1, $2) and exists (
    select 1 from public.projects p where p.id = $1 and p.archived_at is null
  );
$$;

create function app_private.editorial_applicant_eligible(p_project_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_memberships pm
    join public.projects p on p.id = pm.project_id and p.archived_at is null
    join public.brands b on b.id = p.brand_id
    join public.organizations o on o.id = b.organization_id
    join public.agency_memberships am on am.agency_id = o.agency_id and am.user_id = pm.user_id
    where pm.project_id = $1 and pm.user_id = $2
      and pm.status = 'active' and pm.member_type = 'internal'
      and am.status = 'active' and am.role_key = 'contributor'
  );
$$;

create function app_private.record_editorial_event(
  p_project_id uuid, p_type text, p_resource_type text, p_resource_id uuid,
  p_actor uuid, p_correlation uuid, p_key uuid, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_agency uuid; v_org uuid;
begin
  select o.agency_id, o.id into v_agency, v_org
  from public.projects p join public.brands b on b.id = p.brand_id
  join public.organizations o on o.id = b.organization_id where p.id = p_project_id;
  return app_private.emit_event(p_type, p_actor, p_resource_type, p_resource_id,
    v_agency, v_org, p_correlation, p_key, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create function public.create_content_template(
  project_id uuid, name text, default_channel text, default_format text, default_brief text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); created uuid;
begin
  if actor is null or not app_private.editorial_permission(project_id, 'editorial.plan') then
    raise exception using errcode = '42501', message = 'editorial_plan_forbidden';
  end if;
  insert into public.content_templates(project_id,name,default_channel,default_format,default_brief,created_by)
  values (project_id,btrim(name),default_channel,default_format,nullif(btrim(default_brief),''),actor)
  returning id into created;
  perform app_private.record_editorial_event(project_id,'editorial.template.created','content_template',created,actor,gen_random_uuid(),null,'{}');
  return created;
end;
$$;

create function public.update_content_template(
  template_id uuid, name text, default_channel text, default_format text, default_brief text, archive boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.content_templates%rowtype;
begin
  select * into target from public.content_templates where id = template_id for update;
  if actor is null or target.id is null or target.archived_at is not null
    or not app_private.editorial_permission(target.project_id, 'editorial.plan')
    or (archive and not app_private.editorial_permission(target.project_id, 'editorial.archive')) then
    raise exception using errcode = '42501', message = 'editorial_template_forbidden';
  end if;
  update public.content_templates set name=btrim(update_content_template.name),
    default_channel=update_content_template.default_channel, default_format=update_content_template.default_format,
    default_brief=nullif(btrim(update_content_template.default_brief),''),
    archived_at=case when archive then now() else null end where id=template_id;
  perform app_private.record_editorial_event(target.project_id,
    case when archive then 'editorial.template.archived' else 'editorial.template.updated' end,
    'content_template',template_id,actor,gen_random_uuid(),null,'{}');
  return template_id;
end;
$$;

create function public.create_editorial_cycle(project_id uuid, name text, start_date date, end_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); created uuid;
begin
  if actor is null or not app_private.editorial_permission(project_id, 'editorial.plan') then
    raise exception using errcode = '42501', message = 'editorial_plan_forbidden';
  end if;
  insert into public.editorial_cycles(project_id,name,start_date,end_date,created_by)
  values(project_id,btrim(name),start_date,end_date,actor) returning id into created;
  perform app_private.record_editorial_event(project_id,'editorial.cycle.created','editorial_cycle',created,actor,gen_random_uuid(),null,
    jsonb_build_object('start_date',start_date,'end_date',end_date));
  return created;
end;
$$;

create function public.update_editorial_cycle(cycle_id uuid, name text, start_date date, end_date date, status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.editorial_cycles%rowtype;
begin
  select * into target from public.editorial_cycles where id=cycle_id for update;
  if actor is null or target.id is null or target.status='archived'
    or not app_private.editorial_permission(target.project_id, 'editorial.plan')
    or (status='archived' and not app_private.editorial_permission(target.project_id, 'editorial.archive')) then
    raise exception using errcode='42501', message='editorial_cycle_forbidden';
  end if;
  if status not in ('open','closed','archived') or (target.status='closed' and status='open') then
    raise exception using errcode='22023', message='invalid_cycle_transition';
  end if;
  if exists (select 1 from public.editorial_items ei where ei.cycle_id=update_editorial_cycle.cycle_id and ei.archived_at is null
    and (ei.scheduled_date < update_editorial_cycle.start_date or ei.scheduled_date > update_editorial_cycle.end_date)) then
    raise exception using errcode='22023', message='cycle_dates_exclude_items';
  end if;
  if status='archived' and exists (
    select 1 from public.editorial_items ei where ei.cycle_id=update_editorial_cycle.cycle_id and ei.archived_at is null
  ) then
    raise exception using errcode='22023', message='cycle_has_active_items';
  end if;
  update public.editorial_cycles set name=btrim(update_editorial_cycle.name),
    start_date=update_editorial_cycle.start_date,end_date=update_editorial_cycle.end_date,
    status=update_editorial_cycle.status,
    archived_at=case when update_editorial_cycle.status='archived' then now() else null end where id=update_editorial_cycle.cycle_id;
  perform app_private.record_editorial_event(target.project_id,
    case when status='archived' then 'editorial.cycle.archived' else 'editorial.cycle.updated' end,
    'editorial_cycle',cycle_id,actor,gen_random_uuid(),null,'{}');
  return cycle_id;
end;
$$;

create function public.create_editorial_item(
  project_id uuid, cycle_id uuid, template_id uuid, title text, brief text,
  scheduled_date date, scheduled_time time without time zone, channel text, format text,
  idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); cycle_row public.editorial_cycles%rowtype;
  template_row public.content_templates%rowtype; created uuid; work_id uuid;
  final_channel text; final_format text; final_brief text; correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created from public.domain_events de
  where de.actor_id=actor and de.event_type='editorial.item.created' and de.idempotency_key=create_editorial_item.idempotency_key;
  if created is not null then return created; end if;
  if actor is null or not app_private.editorial_permission(project_id,'editorial.create')
    or not app_private.editorial_permission(project_id,'work.create') then
    raise exception using errcode='42501', message='editorial_create_forbidden';
  end if;
  select * into cycle_row from public.editorial_cycles ec where ec.id=cycle_id and ec.project_id=create_editorial_item.project_id for share;
  if cycle_row.id is null or cycle_row.status <> 'open' or scheduled_date not between cycle_row.start_date and cycle_row.end_date then
    raise exception using errcode='22023', message='editorial_cycle_date_invalid';
  end if;
  if template_id is not null then
    select * into template_row from public.content_templates ct where ct.id=template_id and ct.project_id=create_editorial_item.project_id and ct.archived_at is null;
    if template_row.id is null then raise exception using errcode='22023', message='editorial_template_invalid'; end if;
  end if;
  final_channel := coalesce(channel,template_row.default_channel);
  final_format := coalesce(format,template_row.default_format);
  final_brief := coalesce(nullif(btrim(brief),''),template_row.default_brief);
  if final_channel is null or final_format is null then
    raise exception using errcode='22023', message='editorial_channel_format_required';
  end if;
  work_id := app_private.create_work_item(project_id,title,coalesce(final_brief,''),'normal',null,null,'{}'::uuid[],gen_random_uuid());
  insert into public.editorial_items(project_id,cycle_id,work_item_id,template_id,title,brief,
    scheduled_date,scheduled_time,channel,format,created_by)
  values(project_id,cycle_id,work_id,template_id,btrim(title),final_brief,scheduled_date,scheduled_time,
    final_channel,final_format,actor) returning id into created;
  perform app_private.record_editorial_event(project_id,'editorial.item.created','editorial_item',created,actor,correlation,idempotency_key,
    jsonb_build_object('work_item_id',work_id,'cycle_id',cycle_id));
  return created;
end;
$$;

create function public.update_editorial_item(
  item_id uuid, title text, brief text, scheduled_date date, scheduled_time time without time zone,
  channel text, format text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.editorial_items%rowtype;
  work_id uuid;
begin
  select ei.work_item_id into work_id from public.editorial_items ei where ei.id=item_id;
  perform 1 from public.work_items wi where wi.id=work_id for update;
  select * into target from public.editorial_items where id=item_id for update;
  if actor is null or target.id is null or target.planning_state not in ('planned','available')
    or not app_private.editorial_permission(target.project_id,'editorial.update') then
    raise exception using errcode='42501', message='editorial_update_forbidden';
  end if;
  if not exists (select 1 from public.editorial_cycles ec where ec.id=target.cycle_id
    and scheduled_date between ec.start_date and ec.end_date and ec.status='open') then
    raise exception using errcode='22023', message='editorial_cycle_date_invalid';
  end if;
  update public.editorial_items set title=btrim(update_editorial_item.title),brief=nullif(btrim(update_editorial_item.brief),''),
    scheduled_date=update_editorial_item.scheduled_date,scheduled_time=update_editorial_item.scheduled_time,
    channel=update_editorial_item.channel,format=update_editorial_item.format where id=item_id;
  update public.work_items set title=btrim(update_editorial_item.title),description=nullif(btrim(update_editorial_item.brief),'')
    where id=target.work_item_id;
  perform app_private.record_editorial_event(target.project_id,'editorial.item.updated','editorial_item',item_id,actor,gen_random_uuid(),null,'{}');
  return item_id;
end;
$$;

create function public.publish_editorial_available(item_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.editorial_items%rowtype; work_id uuid;
begin
  select ei.work_item_id into work_id from public.editorial_items ei where ei.id=item_id;
  perform 1 from public.work_items wi where wi.id=work_id for update;
  select * into target from public.editorial_items ei where ei.id=item_id for update;
  if actor is null or target.id is null or target.planning_state <> 'planned'
    or not app_private.editorial_permission(target.project_id,'editorial.publish_available')
    or exists(select 1 from public.work_item_assignees wia where wia.work_item_id=work_id and wia.revoked_at is null)
    or exists(select 1 from public.work_items wi where wi.id=work_id and (wi.archived_at is not null or wi.status <> 'todo'))
    or not exists(select 1 from public.editorial_cycles ec where ec.id=target.cycle_id and ec.status='open') then
    raise exception using errcode='42501', message='editorial_publish_forbidden';
  end if;
  update public.editorial_items set planning_state='available' where id=item_id;
  perform app_private.record_editorial_event(target.project_id,'editorial.item.available','editorial_item',item_id,actor,gen_random_uuid(),null,'{}');
  return item_id;
end;
$$;

create function public.apply_to_editorial_work(item_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.editorial_items%rowtype; work_id uuid; created uuid;
begin
  select ei.work_item_id into work_id from public.editorial_items ei where ei.id=item_id;
  perform 1 from public.work_items wi where wi.id=work_id for update;
  select * into target from public.editorial_items ei where ei.id=item_id for update;
  if actor is null or target.id is null or target.planning_state <> 'available'
    or not app_private.editorial_permission(target.project_id,'editorial.apply')
    or not app_private.editorial_applicant_eligible(target.project_id,actor) then
    raise exception using errcode='42501', message='editorial_apply_forbidden';
  end if;
  perform 1 from public.project_memberships pm where pm.project_id=target.project_id and pm.user_id=actor
    and pm.status='active' and pm.member_type='internal' for share;
  if exists(select 1 from public.work_applications wa where wa.editorial_item_id=item_id and wa.applicant_id=actor) then
    select wa.id into created from public.work_applications wa where wa.editorial_item_id=item_id and wa.applicant_id=actor;
    return created;
  end if;
  insert into public.work_applications(editorial_item_id,applicant_id) values(item_id,actor) returning id into created;
  perform app_private.record_editorial_event(target.project_id,'editorial.application.created','work_application',created,actor,gen_random_uuid(),null,
    jsonb_build_object('editorial_item_id',item_id));
  return created;
end;
$$;

create function public.accept_editorial_application(application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); work_id uuid; target public.editorial_items%rowtype;
  application public.work_applications%rowtype; correlation uuid := gen_random_uuid(); rejected record;
begin
  select ei.work_item_id into work_id from public.work_applications wa
  join public.editorial_items ei on ei.id=wa.editorial_item_id where wa.id=application_id;
  perform 1 from public.work_items wi where wi.id=work_id for update;
  select wa.* into application from public.work_applications wa where wa.id=application_id for update;
  select ei.* into target from public.editorial_items ei where ei.id=application.editorial_item_id for update;
  if actor is not null and target.id is not null and application.status='accepted'
    and target.planning_state='assigned'
    and app_private.editorial_permission(target.project_id,'editorial.assign')
    and exists(select 1 from public.work_item_assignees wia where wia.work_item_id=work_id
      and wia.user_id=application.applicant_id and wia.revoked_at is null) then
    return work_id;
  end if;
  if actor is null or target.id is null or application.status <> 'pending' or target.planning_state <> 'available'
    or not app_private.editorial_permission(target.project_id,'editorial.assign')
    or not app_private.editorial_permission(target.project_id,'work.assign')
    or not app_private.editorial_applicant_eligible(target.project_id,application.applicant_id)
    or exists(select 1 from public.work_item_assignees wia where wia.work_item_id=work_id and wia.revoked_at is null)
    or exists(select 1 from public.work_items wi where wi.id=work_id and (wi.archived_at is not null or wi.status <> 'todo')) then
    raise exception using errcode='42501', message='editorial_accept_forbidden';
  end if;
  perform 1 from public.project_memberships pm where pm.project_id=target.project_id
    and pm.user_id=application.applicant_id and pm.status='active' and pm.member_type='internal' for share;
  perform app_private.assign_work_item_core(work_id,array[application.applicant_id],gen_random_uuid());
  update public.work_applications set status='accepted',resolved_at=now(),resolved_by=actor where id=application_id;
  perform app_private.record_editorial_event(target.project_id,'editorial.application.accepted','work_application',application_id,actor,correlation,null,
    jsonb_build_object('editorial_item_id',target.id,'applicant_id',application.applicant_id));
  for rejected in update public.work_applications set status='rejected',resolved_at=now(),resolved_by=actor
    where editorial_item_id=target.id and id<>application_id and status='pending' returning id loop
    perform app_private.record_editorial_event(target.project_id,'editorial.application.rejected','work_application',rejected.id,actor,correlation,null,
      jsonb_build_object('editorial_item_id',target.id));
  end loop;
  update public.editorial_items set planning_state='assigned' where id=target.id;
  perform app_private.record_editorial_event(target.project_id,'editorial.item.assigned','editorial_item',target.id,actor,correlation,null,
    jsonb_build_object('work_item_id',work_id,'applicant_id',application.applicant_id));
  return work_id;
end;
$$;

-- Preserve the existing Work assignment contract; serialize both paths on the Work row.
alter function app_private.assign_work_item(uuid,uuid[],uuid) rename to assign_work_item_core;
create function app_private.assign_work_item(p_work_item_id uuid,p_assignee_ids uuid[],p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.editorial_items%rowtype; actor uuid := (select auth.uid());
  assigned uuid; correlation uuid := gen_random_uuid(); rejected record;
begin
  perform 1 from public.work_items wi where wi.id=p_work_item_id for update;
  select * into target from public.editorial_items ei where ei.work_item_id=p_work_item_id for update;
  if target.id is not null and target.planning_state in ('planned','available')
    and cardinality(coalesce(p_assignee_ids,'{}'::uuid[])) <> 1 then
    raise exception using errcode='22023', message='editorial_requires_one_assignee';
  end if;
  assigned := app_private.assign_work_item_core(p_work_item_id,p_assignee_ids,p_idempotency_key);
  if target.id is not null and target.planning_state in ('planned','available') then
    for rejected in update public.work_applications set status='rejected',resolved_at=now(),resolved_by=actor
      where editorial_item_id=target.id and status='pending' returning id loop
      perform app_private.record_editorial_event(target.project_id,'editorial.application.rejected','work_application',rejected.id,actor,correlation,null,
        jsonb_build_object('editorial_item_id',target.id,'reason','manual_assignment'));
    end loop;
    update public.editorial_items set planning_state='assigned' where id=target.id;
    perform app_private.record_editorial_event(target.project_id,'editorial.item.assigned','editorial_item',target.id,actor,correlation,null,
      jsonb_build_object('work_item_id',p_work_item_id,'reason','manual_assignment'));
  end if;
  return assigned;
end;
$$;

-- An unassigned editorial item cannot advance or disappear through generic Work commands.
alter function app_private.transition_work_item(uuid,text,uuid) rename to transition_work_item_core;
create function app_private.transition_work_item(p_work_item_id uuid,p_status text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.work_items wi where wi.id=p_work_item_id for update;
  if exists(select 1 from public.editorial_items ei where ei.work_item_id=p_work_item_id
    and ei.planning_state in ('planned','available')) then
    raise exception using errcode='22023', message='editorial_work_not_assigned';
  end if;
  return app_private.transition_work_item_core(p_work_item_id,p_status,p_idempotency_key);
end;
$$;

alter function app_private.archive_work_item(uuid,uuid) rename to archive_work_item_core;
create function app_private.archive_work_item(p_work_item_id uuid,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.work_items wi where wi.id=p_work_item_id for update;
  if exists(select 1 from public.editorial_items ei where ei.work_item_id=p_work_item_id
    and ei.planning_state in ('planned','available')) then
    raise exception using errcode='22023', message='archive_editorial_first';
  end if;
  return app_private.archive_work_item_core(p_work_item_id,p_idempotency_key);
end;
$$;

create function public.archive_editorial_item(item_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target public.editorial_items%rowtype; work_id uuid; rejected record;
begin
  select ei.work_item_id into work_id from public.editorial_items ei where ei.id=item_id;
  perform 1 from public.work_items wi where wi.id=work_id for update;
  select * into target from public.editorial_items ei where ei.id=item_id for update;
  if actor is null or target.id is null or target.archived_at is not null
    or not app_private.editorial_permission(target.project_id,'editorial.archive') then
    raise exception using errcode='42501', message='editorial_archive_forbidden';
  end if;
  for rejected in update public.work_applications set status='rejected',resolved_at=now(),resolved_by=actor
    where editorial_item_id=item_id and status='pending' returning id loop
    perform app_private.record_editorial_event(target.project_id,'editorial.application.rejected','work_application',rejected.id,actor,gen_random_uuid(),null,
      jsonb_build_object('editorial_item_id',item_id,'reason','archived'));
  end loop;
  update public.editorial_items set planning_state='cancelled',archived_at=now() where id=item_id;
  perform app_private.record_editorial_event(target.project_id,'editorial.item.archived','editorial_item',item_id,actor,gen_random_uuid(),null,'{}');
  return item_id;
end;
$$;

create function public.editorial_calendar(
  date_from date, date_to date, project_filter uuid default null,
  state_filter text default null, channel_filter text default null
) returns table(item_id uuid,project_id uuid,project_name text,brand_name text,cycle_id uuid,
  work_item_id uuid,title text,brief text,scheduled_date date,scheduled_time time without time zone,
  channel text,format text,planning_state text,template_id uuid,assignee_names text[],
  own_application_status text,can_manage boolean,can_apply boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not app_private.is_internal_actor() then
    raise exception using errcode='42501', message='editorial_view_forbidden';
  end if;
  if date_from is null or date_to is null
    or date_to < date_from or date_to > date_from + 93
    or (state_filter is not null and state_filter not in ('planned','available','assigned','cancelled'))
    or (channel_filter is not null and channel_filter not in ('instagram','facebook','tiktok','linkedin','youtube','website','other')) then
    raise exception using errcode='22023', message='invalid_editorial_window';
  end if;
  if project_filter is not null and not app_private.editorial_permission(project_filter,'editorial.view') then
    raise exception using errcode='42501', message='editorial_view_forbidden';
  end if;
  return query
  select ei.id,p.id,p.name,b.name,ei.cycle_id,ei.work_item_id,ei.title,ei.brief,
    ei.scheduled_date,ei.scheduled_time,ei.channel,ei.format,ei.planning_state,ei.template_id,
    coalesce(assignees.names,'{}'::text[]), own.status,
    app_private.editorial_permission(p.id,'editorial.update'),
    ei.planning_state='available' and app_private.editorial_permission(p.id,'editorial.apply')
      and app_private.editorial_applicant_eligible(p.id,(select auth.uid()))
  from public.editorial_items ei join public.projects p on p.id=ei.project_id
  join public.brands b on b.id=p.brand_id
  left join lateral (select array_agg(coalesce(pr.display_name,au.email,wia.user_id::text) order by wia.user_id) names
    from public.work_item_assignees wia left join public.profiles pr on pr.user_id=wia.user_id
    left join auth.users au on au.id=wia.user_id
    where wia.work_item_id=ei.work_item_id and wia.revoked_at is null) assignees on true
  left join public.work_applications own on own.editorial_item_id=ei.id and own.applicant_id=(select auth.uid())
  where ei.scheduled_date between date_from and date_to and ei.archived_at is null
    and (project_filter is null or ei.project_id=project_filter)
    and (state_filter is null or ei.planning_state=state_filter)
    and (channel_filter is null or ei.channel=channel_filter)
    and app_private.editorial_permission(ei.project_id,'editorial.view')
  order by ei.scheduled_date,ei.scheduled_time nulls last,ei.id;
end;
$$;

create function public.editorial_applications(item_id uuid)
returns table(application_id uuid,applicant_id uuid,applicant_name text,status text,created_at timestamptz,resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare target public.editorial_items%rowtype;
begin
  select * into target from public.editorial_items ei where ei.id=item_id;
  if (select auth.uid()) is null or target.id is null
    or not app_private.editorial_permission(target.project_id,'editorial.assign') then
    raise exception using errcode='42501', message='editorial_applications_forbidden';
  end if;
  return query select wa.id,wa.applicant_id,coalesce(pr.display_name,au.email,wa.applicant_id::text),
    wa.status,wa.created_at,wa.resolved_at
  from public.work_applications wa left join public.profiles pr on pr.user_id=wa.applicant_id
  left join auth.users au on au.id=wa.applicant_id
  where wa.editorial_item_id=item_id order by wa.created_at,wa.id;
end;
$$;

-- Read grants are scoped by RLS; all writes remain server commands.
alter table public.content_templates enable row level security;
alter table public.content_templates force row level security;
alter table public.editorial_cycles enable row level security;
alter table public.editorial_cycles force row level security;
alter table public.editorial_items enable row level security;
alter table public.editorial_items force row level security;
alter table public.work_applications enable row level security;
alter table public.work_applications force row level security;
create policy content_templates_read on public.content_templates for select to authenticated
  using ((select public.project_access_allowed(project_id,'editorial.view')));
create policy editorial_cycles_read on public.editorial_cycles for select to authenticated
  using ((select public.project_access_allowed(project_id,'editorial.view')));
create policy editorial_items_read on public.editorial_items for select to authenticated
  using ((select public.project_access_allowed(project_id,'editorial.view')));
create policy work_applications_read on public.work_applications for select to authenticated using (
  exists (select 1 from public.editorial_items ei where ei.id=editorial_item_id and (
    (applicant_id=(select auth.uid()) and (select public.project_access_allowed(ei.project_id,'editorial.view')))
    or (select public.project_access_allowed(ei.project_id,'editorial.assign'))
  )));
revoke all on public.content_templates,public.editorial_cycles,public.editorial_items,public.work_applications from anon,authenticated;
grant select on public.content_templates,public.editorial_cycles,public.editorial_items,public.work_applications to authenticated;

revoke all on function app_private.editorial_permission(uuid,text),app_private.editorial_applicant_eligible(uuid,uuid),
  app_private.record_editorial_event(uuid,text,text,uuid,uuid,uuid,uuid,jsonb),
  app_private.assign_work_item_core(uuid,uuid[],uuid),app_private.assign_work_item(uuid,uuid[],uuid),
  app_private.transition_work_item_core(uuid,text,uuid),app_private.transition_work_item(uuid,text,uuid),
  app_private.archive_work_item_core(uuid,uuid),app_private.archive_work_item(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke execute on function public.create_content_template(uuid,text,text,text,text),
  public.update_content_template(uuid,text,text,text,text,boolean),
  public.create_editorial_cycle(uuid,text,date,date),public.update_editorial_cycle(uuid,text,date,date,text),
  public.create_editorial_item(uuid,uuid,uuid,text,text,date,time without time zone,text,text,uuid),
  public.update_editorial_item(uuid,text,text,date,time without time zone,text,text),
  public.publish_editorial_available(uuid),public.apply_to_editorial_work(uuid),
  public.accept_editorial_application(uuid),public.archive_editorial_item(uuid),
  public.editorial_calendar(date,date,uuid,text,text),public.editorial_applications(uuid)
  from public,anon;
grant execute on function public.create_content_template(uuid,text,text,text,text),
  public.update_content_template(uuid,text,text,text,text,boolean),
  public.create_editorial_cycle(uuid,text,date,date),public.update_editorial_cycle(uuid,text,date,date,text),
  public.create_editorial_item(uuid,uuid,uuid,text,text,date,time without time zone,text,text,uuid),
  public.update_editorial_item(uuid,text,text,date,time without time zone,text,text),
  public.publish_editorial_available(uuid),public.apply_to_editorial_work(uuid),
  public.accept_editorial_application(uuid),public.archive_editorial_item(uuid),
  public.editorial_calendar(date,date,uuid,text,text),public.editorial_applications(uuid)
  to authenticated;
