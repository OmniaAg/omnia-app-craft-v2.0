-- Phase 7: internal deliverable review. Files and client review remain future boundaries.
insert into public.capabilities (key, description, resource_scope_required) values
  ('deliverable.create', 'Create a deliverable for assigned Project work.', true),
  ('deliverable.submit', 'Submit an immutable deliverable version.', true),
  ('review.configure', 'Configure internal reviewers in a scoped Project.', true),
  ('review.decide', 'Decide only an explicitly assigned internal review.', true),
  ('review.override', 'Director exception for one required reviewer.', true),
  ('deliverable.publish', 'Publish an internally approved deliverable.', true);

insert into public.role_capabilities (role_key, capability_key)
select 'agency_director', key from public.capabilities
where key in ('deliverable.create','deliverable.submit','review.configure','review.decide','review.override','deliverable.publish');
insert into public.role_capabilities (role_key, capability_key) values
  ('project_manager','deliverable.create'),('project_manager','deliverable.submit'),
  ('project_manager','review.decide'),
  ('contributor','deliverable.create'),('contributor','deliverable.submit'),
  ('contributor','review.decide');

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  work_item_id uuid not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','ready_for_client','published_to_client')),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  create_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint deliverables_work_project_fk foreign key (work_item_id,project_id)
    references public.work_items(id,project_id) on delete restrict,
  constraint deliverables_creator_key_unique unique (created_by,create_key),
  constraint deliverables_id_project_unique unique (id,project_id)
);
create index deliverables_project_status_idx on public.deliverables(project_id,status,id) where archived_at is null;
create index deliverables_created_by_idx on public.deliverables(created_by);
create trigger deliverables_updated before update on public.deliverables
for each row execute function app_private.set_updated_at();

create table public.review_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  deliverable_id uuid,
  reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
  active boolean not null default true,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint review_requirements_deliverable_project_fk foreign key (deliverable_id,project_id)
    references public.deliverables(id,project_id) on delete restrict,
  constraint review_requirements_active_check check (active = (retired_at is null))
);
create unique index review_requirements_active_reviewer_idx
  on public.review_requirements(project_id,coalesce(deliverable_id,'00000000-0000-0000-0000-000000000000'::uuid),reviewer_id)
  where active;
create index review_requirements_deliverable_idx on public.review_requirements(deliverable_id) where active;
create index review_requirements_reviewer_idx on public.review_requirements(reviewer_id) where active;

create table public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  notes text not null check (char_length(btrim(notes)) between 1 and 12000),
  submitted_by uuid not null references public.profiles(user_id) on delete restrict,
  submission_key uuid not null,
  submitted_at timestamptz not null default now(),
  constraint deliverable_versions_number_unique unique (deliverable_id,version_number),
  constraint deliverable_versions_actor_key_unique unique (submitted_by,submission_key)
);
create index deliverable_versions_deliverable_history_idx
  on public.deliverable_versions(deliverable_id,version_number desc);

create table public.review_rounds (
  id uuid primary key default gen_random_uuid(),
  deliverable_version_id uuid not null unique references public.deliverable_versions(id) on delete restrict,
  context text not null default 'internal' check (context = 'internal'),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint review_rounds_closed_check check ((status = 'pending') = (closed_at is null))
);

create table public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  review_round_id uuid not null references public.review_rounds(id) on delete restrict,
  requirement_id uuid not null references public.review_requirements(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
  requirement_scope text not null check (requirement_scope in ('project','deliverable')),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','overridden')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint review_assignments_round_requirement_unique unique (review_round_id,requirement_id),
  constraint review_assignments_round_reviewer_unique unique (review_round_id,reviewer_id),
  constraint review_assignments_resolved_check check ((status = 'pending') = (resolved_at is null))
);
create index review_assignments_reviewer_pending_idx
  on public.review_assignments(reviewer_id,status,created_at) where status = 'pending';
create index review_assignments_round_status_idx on public.review_assignments(review_round_id,status);
create index review_assignments_requirement_idx on public.review_assignments(requirement_id);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  review_assignment_id uuid not null unique references public.review_assignments(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
  decision text not null check (decision in ('approve','request_changes')),
  reason text,
  idempotency_key uuid not null,
  decided_at timestamptz not null default now(),
  constraint review_decisions_reason_check check (
    (decision = 'approve' and (reason is null or char_length(btrim(reason)) <= 4000))
    or (decision = 'request_changes' and reason is not null and char_length(btrim(reason)) between 1 and 4000)
  ),
  constraint review_decisions_reviewer_key_unique unique (reviewer_id,idempotency_key)
);

create table public.review_overrides (
  id uuid primary key default gen_random_uuid(),
  review_assignment_id uuid not null unique references public.review_assignments(id) on delete restrict,
  requirement_id uuid not null references public.review_requirements(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
  deliverable_version_id uuid not null references public.deliverable_versions(id) on delete restrict,
  director_id uuid not null references public.profiles(user_id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 4000),
  idempotency_key uuid not null,
  audit_event_id uuid not null unique references public.audit_events(event_id) on delete restrict,
  overridden_at timestamptz not null default now(),
  constraint review_overrides_director_key_unique unique (director_id,idempotency_key)
);
create index review_overrides_requirement_idx on public.review_overrides(requirement_id);
create index review_overrides_reviewer_idx on public.review_overrides(reviewer_id);
create index review_overrides_version_idx on public.review_overrides(deliverable_version_id);

-- The snapshot and the evidence tables are append-only even for privileged SQL users.
create or replace function app_private.phase7_immutable()
returns trigger language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  raise exception using errcode='23514', message='review_history_immutable';
end; $$;

create or replace function public.submit_deliverable_version(deliverable_id uuid,notes text,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_work_id uuid; v_work public.work_items%rowtype;
  v_deliverable public.deliverables%rowtype; v_old public.deliverable_versions%rowtype;
  v_version uuid; v_round uuid; v_number integer; v_count integer;
  v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or idempotency_key is null or char_length(btrim(coalesce(notes,''))) not between 1 and 12000 then
    raise exception using errcode='22023',message='invalid_submission_input'; end if;
  select d.work_item_id into v_work_id from public.deliverables d where d.id=deliverable_id;
  select * into v_work from public.work_items where id=v_work_id for update;
  if v_work.id is null then raise exception using errcode='42501',message='deliverable_submit_forbidden'; end if;
  -- This row also serializes configuration changes with the requirement snapshot.
  perform 1 from public.projects p where p.id=v_work.project_id for update;
  select * into v_deliverable from public.deliverables d where d.id=deliverable_id for update;
  if v_deliverable.id is null or v_deliverable.work_item_id<>v_work.id then
    raise exception using errcode='42501',message='deliverable_submit_forbidden'; end if;
  select * into v_old from public.deliverable_versions dv
    where dv.submitted_by=v_actor and dv.submission_key=idempotency_key;
  if v_old.id is not null then
    if v_old.deliverable_id<>deliverable_id or v_old.notes<>btrim(notes) then
      raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
    return v_old.id;
  end if;
  if not app_private.phase7_can_submit(v_work.id,'deliverable.submit') then
    raise exception using errcode='42501',message='deliverable_submit_forbidden'; end if;
  if v_deliverable.archived_at is not null or v_deliverable.status not in ('draft','changes_requested') then
    raise exception using errcode='22023',message='deliverable_not_submittable'; end if;
  if not exists(select 1 from public.review_requirements rr where rr.active
    and rr.project_id=v_work.project_id and rr.deliverable_id is not distinct from deliverable_id)
    and not exists(select 1 from public.review_requirements rr where rr.active
      and rr.project_id=v_work.project_id and rr.deliverable_id is null) then
    raise exception using errcode='22023',message='review_requirements_missing'; end if;
  if exists(select 1 from public.review_requirements rr where rr.active and rr.project_id=v_work.project_id
    and rr.reviewer_id=v_actor and (rr.deliverable_id=deliverable_id or
      (rr.deliverable_id is null and not exists(select 1 from public.review_requirements x
        where x.active and x.deliverable_id=deliverable_id)))) then
    raise exception using errcode='22023',message='submitter_cannot_review_self'; end if;
  if exists(select 1 from public.review_requirements rr where rr.active and rr.project_id=v_work.project_id
    and (rr.deliverable_id=deliverable_id or (rr.deliverable_id is null and not exists(
      select 1 from public.review_requirements x where x.active and x.deliverable_id=deliverable_id)))
    and not app_private.phase7_reviewer_eligible(v_work.project_id,rr.reviewer_id)) then
    raise exception using errcode='22023',message='reviewer_not_eligible'; end if;
  select coalesce(max(dv.version_number),0)+1 into v_number from public.deliverable_versions dv
    where dv.deliverable_id=deliverable_id;
  insert into public.deliverable_versions(deliverable_id,version_number,notes,submitted_by,submission_key)
    values(deliverable_id,v_number,btrim(notes),v_actor,idempotency_key) returning id into v_version;
  insert into public.review_rounds(deliverable_version_id) values(v_version) returning id into v_round;
  insert into public.review_assignments(review_round_id,requirement_id,reviewer_id,requirement_scope)
  select v_round,rr.id,rr.reviewer_id,case when rr.deliverable_id is null then 'project' else 'deliverable' end
  from public.review_requirements rr where rr.active and rr.project_id=v_work.project_id
    and (rr.deliverable_id=deliverable_id or (rr.deliverable_id is null and not exists(
      select 1 from public.review_requirements x where x.active and x.deliverable_id=deliverable_id)));
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception using errcode='22023',message='review_requirements_missing'; end if;
  update public.deliverables set status='in_review' where id=deliverable_id;
  if v_work.status='todo' then update public.work_items set status='in_progress' where id=v_work.id; end if;
  perform app_private.phase7_event(v_work.id,'deliverable.version.submitted',v_actor,'deliverable_version',v_version,
    v_correlation,idempotency_key,jsonb_build_object('deliverable_id',deliverable_id,'version_number',v_number));
  perform app_private.phase7_event(v_work.id,'review.round.opened',v_actor,'review_round',v_round,
    v_correlation,idempotency_key,jsonb_build_object('deliverable_version_id',v_version,'required_count',v_count));
  return v_version;
end; $$;

create or replace function app_private.phase7_resolve_round(p_round uuid,p_work uuid,p_deliverable uuid,
  p_actor uuid,p_key uuid,p_correlation uuid)
returns text language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_status text;
begin
  if exists(select 1 from public.review_assignments a where a.review_round_id=p_round
    and a.status='changes_requested') then
    v_status := 'changes_requested';
  elsif not exists(select 1 from public.review_assignments a where a.review_round_id=p_round
    and a.status='pending') then
    v_status := 'approved';
  else return 'pending'; end if;
  update public.review_rounds set status=v_status,closed_at=now() where id=p_round and status='pending';
  if v_status='changes_requested' then
    update public.deliverables set status='changes_requested' where id=p_deliverable;
    update public.work_items set status='in_progress',completed_at=null where id=p_work;
    perform app_private.phase7_event(p_work,'review.changes_requested',p_actor,'review_round',p_round,
      p_correlation,p_key,jsonb_build_object('deliverable_id',p_deliverable));
  else
    update public.deliverables set status='ready_for_client' where id=p_deliverable;
    update public.work_items set status='done',completed_at=now() where id=p_work;
    perform app_private.phase7_event(p_work,'review.approved',p_actor,'review_round',p_round,
      p_correlation,p_key,jsonb_build_object('deliverable_id',p_deliverable));
    perform app_private.phase7_event(p_work,'deliverable.ready_for_client',p_actor,'deliverable',p_deliverable,
      p_correlation,p_key,jsonb_build_object('review_round_id',p_round));
  end if;
  return v_status;
end; $$;

create or replace function public.record_review_decision(review_assignment_id uuid,decision text,
  reason text,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_work_id uuid; v_project uuid;
  v_deliverable public.deliverables%rowtype; v_round public.review_rounds%rowtype;
  v_assignment public.review_assignments%rowtype; v_prior public.review_decisions%rowtype;
  v_version public.deliverable_versions%rowtype; v_id uuid; v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or idempotency_key is null or decision not in ('approve','request_changes')
    or (decision='request_changes' and char_length(btrim(coalesce(reason,''))) not between 1 and 4000)
    or (reason is not null and char_length(reason)>4000) then
    raise exception using errcode='22023',message='invalid_review_decision'; end if;
  select d.work_item_id into v_work_id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id
  join public.deliverable_versions dv on dv.id=r.deliverable_version_id
  join public.deliverables d on d.id=dv.deliverable_id where a.id=review_assignment_id;
  perform 1 from public.work_items wi where wi.id=v_work_id for update;
  select d.* into v_deliverable from public.deliverables d where d.work_item_id=v_work_id for update;
  select r.* into v_round from public.review_assignments a
    join public.review_rounds r on r.id=a.review_round_id where a.id=review_assignment_id for update of r;
  select * into v_assignment from public.review_assignments a where a.id=review_assignment_id for update;
  select * into v_version from public.deliverable_versions dv where dv.id=v_round.deliverable_version_id;
  v_project := v_deliverable.project_id;
  if v_assignment.id is null or v_assignment.reviewer_id<>v_actor
    or not app_private.phase7_reviewer_eligible(v_project,v_actor)
    or not app_private.project_permission(v_project,'review.decide')
    or v_version.submitted_by=v_actor then
    raise exception using errcode='42501',message='review_decision_forbidden'; end if;
  select * into v_prior from public.review_decisions rd where rd.review_assignment_id=review_assignment_id;
  if v_prior.id is not null then
    if v_prior.idempotency_key=idempotency_key and v_prior.decision=decision
      and coalesce(v_prior.reason,'')=coalesce(nullif(btrim(reason),''),'') then return v_prior.id; end if;
    raise exception using errcode='22023',message='review_already_decided';
  end if;
  if v_round.status<>'pending' or v_assignment.status<>'pending' or v_deliverable.status<>'in_review' then
    raise exception using errcode='22023',message='review_round_closed'; end if;
  insert into public.review_decisions(review_assignment_id,reviewer_id,decision,reason,idempotency_key)
  values(review_assignment_id,v_actor,decision,nullif(btrim(reason),''),idempotency_key) returning id into v_id;
  update public.review_assignments set status=case when decision='approve' then 'approved' else 'changes_requested' end,
    resolved_at=now() where id=review_assignment_id;
  perform app_private.phase7_event(v_work_id,'review.decision.recorded',v_actor,'review_decision',v_id,
    v_correlation,idempotency_key,jsonb_build_object('review_round_id',v_round.id,'review_assignment_id',review_assignment_id,
      'decision',decision,'deliverable_version_id',v_version.id));
  perform app_private.phase7_resolve_round(v_round.id,v_work_id,v_deliverable.id,v_actor,idempotency_key,v_correlation);
  return v_id;
end; $$;

create or replace function public.override_review_requirement(review_assignment_id uuid,reason text,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_work_id uuid; v_deliverable public.deliverables%rowtype;
  v_round public.review_rounds%rowtype; v_assignment public.review_assignments%rowtype;
  v_prior public.review_overrides%rowtype; v_version uuid; v_domain uuid; v_audit uuid;
  v_id uuid; v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or idempotency_key is null or char_length(btrim(coalesce(reason,''))) not between 1 and 4000 then
    raise exception using errcode='22023',message='override_reason_required'; end if;
  select d.work_item_id into v_work_id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id join public.deliverable_versions dv on dv.id=r.deliverable_version_id
  join public.deliverables d on d.id=dv.deliverable_id where a.id=review_assignment_id;
  perform 1 from public.work_items wi where wi.id=v_work_id for update;
  select * into v_deliverable from public.deliverables d where d.work_item_id=v_work_id for update;
  select r.* into v_round from public.review_assignments a join public.review_rounds r on r.id=a.review_round_id
    where a.id=review_assignment_id for update of r;
  select * into v_assignment from public.review_assignments a where a.id=review_assignment_id for update;
  if v_assignment.id is null or not app_private.project_permission(v_deliverable.project_id,'review.override')
    or not exists(select 1 from public.projects p join public.brands b on b.id=p.brand_id
      join public.organizations o on o.id=b.organization_id join public.agency_memberships am on am.agency_id=o.agency_id
      where p.id=v_deliverable.project_id and am.user_id=v_actor and am.status='active'
      and am.role_key='agency_director') then
    raise exception using errcode='42501',message='review_override_forbidden'; end if;
  select * into v_prior from public.review_overrides ro where ro.review_assignment_id=review_assignment_id;
  if v_prior.id is not null then
    if v_prior.director_id=v_actor and v_prior.idempotency_key=idempotency_key
      and v_prior.reason=btrim(reason) then return v_prior.id; end if;
    raise exception using errcode='22023',message='review_already_resolved'; end if;
  if v_round.status<>'pending' or v_assignment.status<>'pending' or v_deliverable.status<>'in_review' then
    raise exception using errcode='22023',message='review_round_closed'; end if;
  v_version := v_round.deliverable_version_id;
  v_domain := app_private.phase7_event(v_work_id,'review.requirement.overridden',v_actor,'review_round',v_round.id,
    v_correlation,idempotency_key,jsonb_build_object('deliverable_id',v_deliverable.id,
      'deliverable_version_id',v_version,'review_assignment_id',v_assignment.id,
      'requirement_id',v_assignment.requirement_id,'reviewer_id',v_assignment.reviewer_id,'reason',btrim(reason)));
  select ae.event_id into v_audit from public.audit_events ae where ae.domain_event_id=v_domain;
  insert into public.review_overrides(review_assignment_id,requirement_id,reviewer_id,deliverable_version_id,
    director_id,reason,idempotency_key,audit_event_id)
  values(v_assignment.id,v_assignment.requirement_id,v_assignment.reviewer_id,v_version,v_actor,btrim(reason),
    idempotency_key,v_audit) returning id into v_id;
  update public.review_assignments set status='overridden',resolved_at=now() where id=v_assignment.id;
  perform app_private.phase7_resolve_round(v_round.id,v_work_id,v_deliverable.id,v_actor,idempotency_key,v_correlation);
  return v_id;
end; $$;

alter table public.deliverables add column publish_key uuid;
alter table public.deliverables add column published_by uuid references public.profiles(user_id) on delete restrict;
alter table public.deliverables add column published_at timestamptz;
create index deliverables_published_by_idx on public.deliverables(published_by) where published_by is not null;

create or replace function public.publish_deliverable_to_client(deliverable_id uuid,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_work uuid; v_deliverable public.deliverables%rowtype;
begin
  if v_actor is null or idempotency_key is null then
    raise exception using errcode='22023',message='invalid_publication_input'; end if;
  select d.work_item_id into v_work from public.deliverables d where d.id=deliverable_id;
  perform 1 from public.work_items wi where wi.id=v_work for update;
  select * into v_deliverable from public.deliverables d where d.id=deliverable_id for update;
  if v_deliverable.id is null or not app_private.project_permission(v_deliverable.project_id,'deliverable.publish') then
    raise exception using errcode='42501',message='deliverable_publish_forbidden'; end if;
  if v_deliverable.status='published_to_client' and v_deliverable.publish_key=idempotency_key
    and v_deliverable.published_by=v_actor then return deliverable_id; end if;
  if v_deliverable.status<>'ready_for_client' then
    raise exception using errcode='22023',message='deliverable_not_ready'; end if;
  update public.deliverables set status='published_to_client',publish_key=idempotency_key,
    published_by=v_actor,published_at=now() where id=deliverable_id;
  perform app_private.phase7_event(v_work,'deliverable.published_to_client',v_actor,'deliverable',deliverable_id,
    gen_random_uuid(),idempotency_key,jsonb_build_object('internal_review_complete',true));
  return deliverable_id;
end; $$;
create trigger deliverable_versions_immutable before update or delete on public.deliverable_versions
for each row execute function app_private.phase7_immutable();
create trigger review_decisions_immutable before update or delete on public.review_decisions
for each row execute function app_private.phase7_immutable();
create trigger review_overrides_immutable before update or delete on public.review_overrides
for each row execute function app_private.phase7_immutable();
create trigger review_requirements_no_delete before delete on public.review_requirements
for each row execute function app_private.phase7_immutable();
create trigger review_rounds_no_delete before delete on public.review_rounds
for each row execute function app_private.phase7_immutable();
create trigger review_assignments_no_delete before delete on public.review_assignments
for each row execute function app_private.phase7_immutable();

create or replace function app_private.phase7_guard_history_update()
returns trigger language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  if tg_table_name='review_assignments' then
    if old.status<>'pending' or
      (new.id,new.review_round_id,new.requirement_id,new.reviewer_id,new.requirement_scope,new.created_at)
      is distinct from
      (old.id,old.review_round_id,old.requirement_id,old.reviewer_id,old.requirement_scope,old.created_at)
      or new.status not in ('approved','changes_requested','overridden') then
      raise exception using errcode='23514',message='review_history_immutable'; end if;
  elsif tg_table_name='review_rounds' then
    if old.status<>'pending' or
      (new.id,new.deliverable_version_id,new.context,new.opened_at)
      is distinct from (old.id,old.deliverable_version_id,old.context,old.opened_at)
      or new.status not in ('approved','changes_requested') then
      raise exception using errcode='23514',message='review_history_immutable'; end if;
  elsif tg_table_name='review_requirements' then
    if not old.active or new.active or new.retired_at is null or
      (new.id,new.project_id,new.deliverable_id,new.reviewer_id,new.created_by,new.created_at)
      is distinct from (old.id,old.project_id,old.deliverable_id,old.reviewer_id,old.created_by,old.created_at)
    then raise exception using errcode='23514',message='review_history_immutable'; end if;
  elsif tg_table_name='deliverables' then
    if (new.id,new.project_id,new.work_item_id,new.created_by,new.create_key,new.created_at)
      is distinct from (old.id,old.project_id,old.work_item_id,old.created_by,old.create_key,old.created_at)
    then raise exception using errcode='23514',message='deliverable_relationship_immutable'; end if;
  end if;
  return new;
end; $$;
create trigger review_assignments_guard before update on public.review_assignments
for each row execute function app_private.phase7_guard_history_update();
create trigger review_rounds_guard before update on public.review_rounds
for each row execute function app_private.phase7_guard_history_update();
create trigger review_requirements_guard before update on public.review_requirements
for each row execute function app_private.phase7_guard_history_update();
create trigger deliverables_relationship_guard before update on public.deliverables
for each row execute function app_private.phase7_guard_history_update();

create or replace function app_private.phase7_reviewer_eligible(p_project uuid,p_reviewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    join public.brands b on b.id=p.brand_id
    join public.organizations o on o.id=b.organization_id
    join public.agency_memberships am on am.agency_id=o.agency_id
      and am.user_id=p_reviewer and am.status='active'
    where p.id=p_project
      and (am.role_key='agency_director' or exists (
        select 1 from public.project_memberships pm where pm.project_id=p.id
          and pm.user_id=p_reviewer and pm.member_type='internal' and pm.status='active'))
      and (exists(select 1 from public.role_capabilities rc
        where rc.role_key=am.role_key and rc.capability_key='review.decide')
        or exists(select 1 from public.capability_grants cg
          where cg.user_id=p_reviewer and cg.capability_key='review.decide'
          and cg.agency_id=o.agency_id and cg.revoked_at is null
          and (cg.expires_at is null or cg.expires_at>now())
          and (cg.scope_kind='agency' or cg.organization_id=o.id)))
  );
$$;

create or replace function app_private.phase7_can_submit(p_work uuid,p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.work_items wi
    where wi.id=p_work and wi.archived_at is null
      and wi.status in ('todo','in_progress')
      and app_private.project_permission(wi.project_id,p_capability)
      and exists(select 1 from public.work_item_assignees wa
        where wa.work_item_id=wi.id and wa.user_id=(select auth.uid()) and wa.revoked_at is null)
  );
$$;

create or replace function app_private.phase7_event(p_work uuid,p_type text,p_actor uuid,
  p_resource_type text,p_resource uuid,p_correlation uuid,p_key uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_agency uuid; v_org uuid;
begin
  select o.agency_id,o.id into v_agency,v_org from public.work_items wi
  join public.projects p on p.id=wi.project_id join public.brands b on b.id=p.brand_id
  join public.organizations o on o.id=b.organization_id where wi.id=p_work;
  if p_work is null and p_resource_type='project' then
    select o.agency_id,o.id into v_agency,v_org from public.projects p
    join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id
    where p.id=p_resource;
  end if;
  return app_private.emit_event(p_type,p_actor,p_resource_type,p_resource,v_agency,v_org,
    p_correlation,p_key,coalesce(p_payload,'{}'::jsonb));
end; $$;

create or replace function public.create_deliverable(work_item_id uuid,title text,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_work public.work_items%rowtype;
  v_existing public.deliverables%rowtype; v_id uuid; v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or idempotency_key is null or char_length(btrim(coalesce(title,''))) not between 1 and 240 then
    raise exception using errcode='22023',message='invalid_deliverable_input'; end if;
  select * into v_work from public.work_items where id=work_item_id for update;
  if v_work.id is null then
    raise exception using errcode='42501',message='deliverable_create_forbidden'; end if;
  select * into v_existing from public.deliverables where created_by=v_actor and create_key=idempotency_key;
  if v_existing.id is not null then
    if v_existing.work_item_id<>work_item_id or v_existing.title<>btrim(title) then
      raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
    return v_existing.id;
  end if;
  if not app_private.phase7_can_submit(work_item_id,'deliverable.create') then
    raise exception using errcode='42501',message='deliverable_create_forbidden'; end if;
  if exists(select 1 from public.deliverables d where d.work_item_id=work_item_id) then
    raise exception using errcode='23505',message='work_deliverable_exists'; end if;
  insert into public.deliverables(project_id,work_item_id,title,created_by,create_key)
    values(v_work.project_id,work_item_id,btrim(title),v_actor,idempotency_key) returning id into v_id;
  perform app_private.phase7_event(work_item_id,'deliverable.created',v_actor,'deliverable',v_id,
    v_correlation,idempotency_key,jsonb_build_object('work_item_id',work_item_id));
  return v_id;
end; $$;

-- Replacing configuration retires rows, never deletes requirements referenced by a round.
create or replace function public.configure_review_requirements(project_id uuid,deliverable_id uuid,
  reviewer_ids uuid[],idempotency_key uuid)
returns integer language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_project public.projects%rowtype;
  v_reviewer uuid; v_correlation uuid := gen_random_uuid(); v_count integer;
begin
  if v_actor is null or idempotency_key is null or reviewer_ids is null
    or cardinality(reviewer_ids) not between 1 and 12
    or array_position(reviewer_ids,null) is not null
    or (select count(distinct x) from unnest(reviewer_ids) x)<>cardinality(reviewer_ids) then
    raise exception using errcode='22023',message='invalid_review_configuration'; end if;
  select * into v_project from public.projects where id=project_id for update;
  if v_project.id is null or v_project.archived_at is not null
    or not app_private.project_permission(project_id,'review.configure') then
    raise exception using errcode='42501',message='review_configure_forbidden'; end if;
  if deliverable_id is not null and not exists(select 1 from public.deliverables d
    where d.id=deliverable_id and d.project_id=project_id and d.archived_at is null) then
    raise exception using errcode='22023',message='invalid_review_deliverable'; end if;
  if deliverable_id is not null then
    perform 1 from public.deliverables d where d.id=deliverable_id for update;
  end if;
  -- Same key is a true retry only for the same target and reviewer set.
  if exists(select 1 from public.domain_events e where e.actor_id=v_actor
    and e.event_type='review.requirements.configured' and e.idempotency_key=idempotency_key) then
    if not exists(select 1 from public.domain_events e where e.actor_id=v_actor
      and e.event_type='review.requirements.configured' and e.idempotency_key=idempotency_key
      and e.payload->>'project_id'=project_id::text
      and e.payload->>'deliverable_id'=coalesce(deliverable_id::text,'')
      and e.payload->'reviewer_ids'=to_jsonb((select array_agg(x order by x) from unnest(reviewer_ids) x))) then
      raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
    return cardinality(reviewer_ids);
  end if;
  foreach v_reviewer in array reviewer_ids loop
    if not app_private.phase7_reviewer_eligible(project_id,v_reviewer) then
      raise exception using errcode='22023',message='reviewer_not_eligible'; end if;
  end loop;
  update public.review_requirements set active=false,retired_at=now()
  where review_requirements.project_id=configure_review_requirements.project_id
    and review_requirements.deliverable_id is not distinct from configure_review_requirements.deliverable_id
    and active;
  insert into public.review_requirements(project_id,deliverable_id,reviewer_id,created_by)
  select configure_review_requirements.project_id,configure_review_requirements.deliverable_id,x,v_actor
  from unnest(reviewer_ids) x;
  v_count := cardinality(reviewer_ids);
  perform app_private.phase7_event(
    (select d.work_item_id from public.deliverables d where d.id=deliverable_id),
    'review.requirements.configured',v_actor,'project',project_id,v_correlation,idempotency_key,
    jsonb_build_object('project_id',project_id,'deliverable_id',coalesce(deliverable_id::text,''),
      'reviewer_ids',(select to_jsonb(array_agg(x order by x)) from unnest(reviewer_ids) x)));
  return v_count;
end; $$;

create or replace function app_private.phase7_read_allowed(p_deliverable uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.deliverables d where d.id=p_deliverable
    and (app_private.can_read_work_item(d.work_item_id)
      or (app_private.project_permission(d.project_id,'review.decide')
        and app_private.phase7_reviewer_eligible(d.project_id,(select auth.uid()))
        and exists(select 1 from public.deliverable_versions dv
          join public.review_rounds r on r.deliverable_version_id=dv.id
          join public.review_assignments a on a.review_round_id=r.id
          where dv.deliverable_id=d.id and a.reviewer_id=(select auth.uid())))));
$$;

create or replace function public.review_queue(page_limit integer default 50,page_offset integer default 0)
returns table(assignment_id uuid,project_id uuid,project_name text,brand_name text,
  work_item_id uuid,work_title text,deliverable_id uuid,deliverable_title text,
  version_number integer,submitted_at timestamptz,assignment_status text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if (select auth.uid()) is null or not app_private.is_internal_actor() then
    raise exception using errcode='42501',message='review_queue_forbidden'; end if;
  if page_limit not between 1 and 100 or page_offset<0 then
    raise exception using errcode='22023',message='invalid_review_queue_input'; end if;
  return query select a.id,p.id,p.name,b.name,wi.id,wi.title,d.id,d.title,
    dv.version_number,dv.submitted_at,a.status
  from public.review_assignments a join public.review_rounds r on r.id=a.review_round_id
  join public.deliverable_versions dv on dv.id=r.deliverable_version_id
  join public.deliverables d on d.id=dv.deliverable_id
  join public.work_items wi on wi.id=d.work_item_id
  join public.projects p on p.id=d.project_id join public.brands b on b.id=p.brand_id
  where a.reviewer_id=(select auth.uid()) and a.status='pending' and r.status='pending'
    and app_private.project_permission(d.project_id,'review.decide')
    and app_private.phase7_reviewer_eligible(d.project_id,(select auth.uid()))
  order by dv.submitted_at,a.id limit page_limit offset page_offset;
end; $$;

create or replace function public.deliverable_detail(work_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_work public.work_items%rowtype; v_deliverable public.deliverables%rowtype;
begin
  select * into v_work from public.work_items wi where wi.id=work_item_id;
  select * into v_deliverable from public.deliverables d where d.work_item_id=work_item_id;
  if v_work.id is null or (not app_private.can_read_work_item(work_item_id)
    and (v_deliverable.id is null or not app_private.phase7_read_allowed(v_deliverable.id))) then
    raise exception using errcode='42501',message='deliverable_detail_forbidden'; end if;
  return jsonb_build_object(
    'work',jsonb_build_object('id',v_work.id,'project_id',v_work.project_id,
      'title',v_work.title,'status',v_work.status,'archived_at',v_work.archived_at),
    'deliverable',case when v_deliverable.id is null then null else
      jsonb_build_object('id',v_deliverable.id,'title',v_deliverable.title,
        'status',v_deliverable.status,'created_at',v_deliverable.created_at,
        'published_at',v_deliverable.published_at) end,
    'can_create',v_deliverable.id is null and app_private.phase7_can_submit(work_item_id,'deliverable.create'),
    'can_submit',v_deliverable.id is not null and v_deliverable.status in ('draft','changes_requested')
      and app_private.phase7_can_submit(work_item_id,'deliverable.submit'),
    'can_publish',v_deliverable.status='ready_for_client'
      and app_private.project_permission(v_work.project_id,'deliverable.publish'),
    'can_override',app_private.project_permission(v_work.project_id,'review.override')
      and exists(select 1 from public.projects p join public.brands b on b.id=p.brand_id
        join public.organizations o on o.id=b.organization_id
        join public.agency_memberships am on am.agency_id=o.agency_id
        where p.id=v_work.project_id and am.user_id=(select auth.uid())
          and am.status='active' and am.role_key='agency_director'),
    'versions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',dv.id,'version_number',dv.version_number,'notes',dv.notes,
      'submitted_at',dv.submitted_at,'submitted_by',dv.submitted_by,
      'submitter_name',coalesce(sp.display_name,'Miembro'),
      'round',jsonb_build_object('id',r.id,'status',r.status,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'assignments',coalesce((select jsonb_agg(jsonb_build_object(
          'id',a.id,'reviewer_id',a.reviewer_id,'reviewer_name',coalesce(rp.display_name,'Miembro'),
          'requirement_id',a.requirement_id,'requirement_scope',a.requirement_scope,
          'status',a.status,'resolved_at',a.resolved_at,
          'decision',rd.decision,'reason',rd.reason,'decided_at',rd.decided_at,
          'override_reason',ro.reason,'overridden_at',ro.overridden_at,
          'override_director_id',ro.director_id
        ) order by a.created_at,a.id) from public.review_assignments a
          left join public.profiles rp on rp.user_id=a.reviewer_id
          left join public.review_decisions rd on rd.review_assignment_id=a.id
          left join public.review_overrides ro on ro.review_assignment_id=a.id
          where a.review_round_id=r.id),'[]'::jsonb))
      ) order by dv.version_number desc)
      from public.deliverable_versions dv join public.review_rounds r on r.deliverable_version_id=dv.id
      left join public.profiles sp on sp.user_id=dv.submitted_by
      where dv.deliverable_id=v_deliverable.id),'[]'::jsonb)
  );
end; $$;

create or replace function public.review_configuration(project_id uuid,deliverable_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not app_private.project_permission(project_id,'project.view')
    or (deliverable_id is not null and not exists(select 1 from public.deliverables d
      where d.id=deliverable_id and d.project_id=project_id)) then
    raise exception using errcode='42501',message='review_configuration_forbidden'; end if;
  return jsonb_build_object(
    'can_configure',app_private.project_permission(project_id,'review.configure'),
    'requirements',coalesce((select jsonb_agg(jsonb_build_object('id',rr.id,
      'reviewer_id',rr.reviewer_id,'reviewer_name',coalesce(pr.display_name,'Miembro'),
      'scope',case when rr.deliverable_id is null then 'project' else 'deliverable' end)
      order by rr.created_at,rr.id) from public.review_requirements rr
      left join public.profiles pr on pr.user_id=rr.reviewer_id
      where rr.project_id=review_configuration.project_id and rr.active
        and rr.deliverable_id is not distinct from review_configuration.deliverable_id),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('user_id',c.user_id,
      'display_name',coalesce(pr.display_name,'Miembro')) order by pr.display_name,c.user_id)
      from (select distinct am.user_id from public.projects p
        join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id
        join public.agency_memberships am on am.agency_id=o.agency_id and am.status='active'
        where p.id=review_configuration.project_id and
          app_private.phase7_reviewer_eligible(p.id,am.user_id)) c
      left join public.profiles pr on pr.user_id=c.user_id),'[]'::jsonb)
  );
end; $$;

-- Work is execution state; this guard prevents its generic command from bypassing review.
create or replace function app_private.phase7_guard_work_status()
returns trigger language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_status text;
begin
  select d.status into v_status from public.deliverables d where d.work_item_id=new.id;
  if v_status is not null and new.status='done'
    and v_status not in ('ready_for_client','published_to_client') then
    raise exception using errcode='22023',message='deliverable_review_required'; end if;
  if v_status='in_review' and new.status not in ('in_progress') then
    raise exception using errcode='22023',message='deliverable_review_pending'; end if;
  if v_status in ('ready_for_client','published_to_client') and new.status<>'done' then
    raise exception using errcode='22023',message='deliverable_review_complete'; end if;
  return new;
end; $$;
create trigger phase7_work_status_guard before update of status on public.work_items
for each row execute function app_private.phase7_guard_work_status();

alter table public.deliverables enable row level security;
alter table public.deliverables force row level security;
alter table public.deliverable_versions enable row level security;
alter table public.deliverable_versions force row level security;
alter table public.review_requirements enable row level security;
alter table public.review_requirements force row level security;
alter table public.review_rounds enable row level security;
alter table public.review_rounds force row level security;
alter table public.review_assignments enable row level security;
alter table public.review_assignments force row level security;
alter table public.review_decisions enable row level security;
alter table public.review_decisions force row level security;
alter table public.review_overrides enable row level security;
alter table public.review_overrides force row level security;

create or replace function public.deliverable_access_allowed(deliverable_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.phase7_read_allowed($1);
$$;
revoke execute on function public.deliverable_access_allowed(uuid) from public,anon;
grant execute on function public.deliverable_access_allowed(uuid) to authenticated;

create policy deliverables_internal_read on public.deliverables for select to authenticated
using ((select public.deliverable_access_allowed(id)));
create policy deliverable_versions_internal_read on public.deliverable_versions for select to authenticated
using ((select public.deliverable_access_allowed(deliverable_id)));
create policy review_requirements_internal_read on public.review_requirements for select to authenticated
using ((select public.project_access_allowed(project_id,'review.configure')));
create policy review_rounds_internal_read on public.review_rounds for select to authenticated
using (exists(select 1 from public.deliverable_versions dv where dv.id=deliverable_version_id
  and (select public.deliverable_access_allowed(dv.deliverable_id))));
create policy review_assignments_internal_read on public.review_assignments for select to authenticated
using (exists(select 1 from public.review_rounds r join public.deliverable_versions dv
  on dv.id=r.deliverable_version_id where r.id=review_round_id
  and (select public.deliverable_access_allowed(dv.deliverable_id))));
create policy review_decisions_internal_read on public.review_decisions for select to authenticated
using (exists(select 1 from public.review_assignments a join public.review_rounds r on r.id=a.review_round_id
  join public.deliverable_versions dv on dv.id=r.deliverable_version_id
  where a.id=review_assignment_id and (select public.deliverable_access_allowed(dv.deliverable_id))));
create policy review_overrides_internal_read on public.review_overrides for select to authenticated
using (exists(select 1 from public.deliverable_versions dv where dv.id=deliverable_version_id
  and (select public.deliverable_access_allowed(dv.deliverable_id))));

revoke all on public.deliverables,public.deliverable_versions,public.review_requirements,
  public.review_rounds,public.review_assignments,public.review_decisions,public.review_overrides
  from anon,authenticated;
grant select on public.deliverables,public.deliverable_versions,public.review_requirements,
  public.review_rounds,public.review_assignments,public.review_decisions,public.review_overrides
  to authenticated;

revoke all on function app_private.phase7_immutable(),app_private.phase7_guard_history_update(),
  app_private.phase7_reviewer_eligible(uuid,uuid),
  app_private.phase7_can_submit(uuid,text),app_private.phase7_event(uuid,text,uuid,text,uuid,uuid,uuid,jsonb),
  app_private.phase7_resolve_round(uuid,uuid,uuid,uuid,uuid,uuid),
  app_private.phase7_read_allowed(uuid),app_private.phase7_guard_work_status()
  from public,anon,authenticated,service_role;
revoke execute on function public.create_deliverable(uuid,text,uuid),
  public.configure_review_requirements(uuid,uuid,uuid[],uuid),
  public.submit_deliverable_version(uuid,text,uuid),
  public.record_review_decision(uuid,text,text,uuid),
  public.override_review_requirement(uuid,text,uuid),
  public.publish_deliverable_to_client(uuid,uuid),
  public.review_queue(integer,integer),public.deliverable_detail(uuid),
  public.review_configuration(uuid,uuid)
  from public,anon;
grant execute on function public.create_deliverable(uuid,text,uuid),
  public.configure_review_requirements(uuid,uuid,uuid[],uuid),
  public.submit_deliverable_version(uuid,text,uuid),
  public.record_review_decision(uuid,text,text,uuid),
  public.override_review_requirement(uuid,text,uuid),
  public.publish_deliverable_to_client(uuid,uuid),
  public.review_queue(integer,integer),public.deliverable_detail(uuid),
  public.review_configuration(uuid,uuid)
  to authenticated;

comment on table public.deliverable_versions is
  'Immutable metadata/notes snapshot. Phase 8 will attach file assets through a separate relation.';
comment on table public.review_requirements is
  'Concrete internal reviewers per Project, optionally replaced per Deliverable. Changes retire rows; assignments preserve snapshots.';
comment on table public.review_overrides is
  'Append-only Director exception; each row points to its audit event and never represents an approval decision.';
