-- Phase 9: explicit client publication and review boundary.
alter table public.deliverables add column published_version_id uuid references public.deliverable_versions(id) on delete restrict;
alter table public.deliverables drop constraint deliverables_status_check;
alter table public.deliverables add constraint deliverables_status_check check
 (status in ('draft','in_review','changes_requested','ready_for_client','published_to_client','client_approved'));

create table public.client_publications (
 id uuid primary key default gen_random_uuid(),
 deliverable_id uuid not null references public.deliverables(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 version_id uuid not null unique references public.deliverable_versions(id) on delete restrict,
 published_by uuid not null references public.profiles(user_id) on delete restrict,
 idempotency_key uuid not null,
 published_at timestamptz not null default now(),
 unique(published_by,idempotency_key)
);
create index client_publications_project_date_idx on public.client_publications(project_id,published_at desc,id);
create index client_publications_deliverable_date_idx on public.client_publications(deliverable_id,published_at desc);

create table public.client_reviews (
 id uuid primary key default gen_random_uuid(),
 publication_id uuid not null unique references public.client_publications(id) on delete restrict,
 context text not null default 'client' check(context='client'),
 status text not null default 'pending' check(status in ('pending','approved','changes_requested')),
 opened_at timestamptz not null default now(),
 closed_at timestamptz,
 check((status='pending')=(closed_at is null))
);
create table public.client_review_assignments (
 id uuid primary key default gen_random_uuid(),
 client_review_id uuid not null references public.client_reviews(id) on delete restrict,
 reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','approved','changes_requested')),
 assigned_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(client_review_id,reviewer_id),
 check((status='pending')=(resolved_at is null))
);
create index client_review_assignments_queue_idx on public.client_review_assignments(reviewer_id,assigned_at desc,id) where status='pending';
create table public.client_review_decisions (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null unique references public.client_review_assignments(id) on delete restrict,
 reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
 decision text not null check(decision in ('approve','request_changes')),
 reason text,
 idempotency_key uuid not null,
 decided_at timestamptz not null default now(),
 unique(reviewer_id,idempotency_key),
 check ((decision='approve' and (reason is null or char_length(btrim(reason))<=4000))
   or (decision='request_changes' and reason is not null and char_length(btrim(reason)) between 1 and 4000))
);
create table public.client_feedback (
 id uuid primary key default gen_random_uuid(),
 publication_id uuid not null references public.client_publications(id) on delete restrict,
 author_id uuid not null references public.profiles(user_id) on delete restrict,
 body text not null check(char_length(btrim(body)) between 1 and 4000),
 idempotency_key uuid not null,
 created_at timestamptz not null default now(),
 unique(author_id,idempotency_key)
);
create index client_feedback_publication_idx on public.client_feedback(publication_id,created_at,id);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(user_id) on delete restrict,
 domain_event_id uuid not null references public.domain_events(event_id) on delete restrict,
 kind text not null check(kind in ('deliverable_published','approval_pending','client_approved','client_changes_requested')),
 project_id uuid not null references public.projects(id) on delete restrict,
 deliverable_id uuid not null references public.deliverables(id) on delete restrict,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 unique(recipient_id,domain_event_id,kind)
);
create index notifications_recipient_date_idx on public.notifications(recipient_id,created_at desc,id);

create function app_private.client_project_access(p_project uuid,p_actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null and exists (
  select 1 from public.projects p
  join public.brands b on b.id=p.brand_id
  join public.organizations o on o.id=b.organization_id
  join public.client_memberships cm on cm.organization_id=o.id and cm.user_id=p_actor and cm.status='active'
  join public.project_memberships pm on pm.project_id=p.id and pm.user_id=p_actor
   and pm.member_type='client' and pm.status='active'
  where p.id=p_project and p.archived_at is null and o.lifecycle='active_client');
$$;
create function app_private.client_reviewer_access(p_project uuid,p_actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.client_project_access(p_project,p_actor) and exists (
  select 1 from public.projects p join public.brands b on b.id=p.brand_id
  join public.client_memberships cm on cm.organization_id=b.organization_id
  where p.id=p_project and cm.user_id=p_actor and cm.status='active' and cm.role_key='client_reviewer');
$$;
create function app_private.client_asset_access(p_asset uuid,p_actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.file_assets fa
  join public.deliverable_files df on df.asset_id=fa.id
  join public.client_publications cp on cp.version_id=df.deliverable_version_id and cp.project_id=fa.project_id
  where fa.id=p_asset and fa.status='ready' and app_private.client_project_access(cp.project_id,p_actor));
$$;

-- A version stays visible only through its immutable publication record.
create or replace function public.publish_deliverable_to_client(deliverable_id uuid,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare v_actor uuid:=auth.uid(); v_d public.deliverables%rowtype; v_version uuid;
 v_prior public.client_publications%rowtype; v_publication uuid; v_review uuid; v_count integer;
 v_event uuid; v_correlation uuid:=gen_random_uuid();
begin
 if v_actor is null or idempotency_key is null then
  raise exception using errcode='22023',message='invalid_publication_input'; end if;
 select * into v_prior from public.client_publications cp
  where cp.published_by=v_actor and cp.idempotency_key=idempotency_key;
 if v_prior.id is not null then
  if v_prior.deliverable_id<>deliverable_id then
   raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
  return deliverable_id;
 end if;
 select * into v_d from public.deliverables d where d.id=deliverable_id for update;
 if v_d.id is null or v_d.archived_at is not null or not app_private.project_permission(v_d.project_id,'deliverable.publish') then
  raise exception using errcode='42501',message='deliverable_publish_forbidden'; end if;
 if v_d.status<>'ready_for_client' then
  raise exception using errcode='22023',message='deliverable_not_ready'; end if;
 select dv.id into v_version from public.deliverable_versions dv
 join public.review_rounds rr on rr.deliverable_version_id=dv.id and rr.status='approved'
 where dv.deliverable_id=deliverable_id order by dv.version_number desc limit 1;
 if v_version is null or v_version is distinct from
   (select dv.id from public.deliverable_versions dv where dv.deliverable_id=deliverable_id
    order by dv.version_number desc limit 1) then
  raise exception using errcode='22023',message='latest_version_not_approved'; end if;
 if exists(select 1 from public.client_publications cp where cp.version_id=v_version) then
  raise exception using errcode='22023',message='version_already_published'; end if;
 if exists(select 1 from public.deliverable_files df join public.file_assets fa on fa.id=df.asset_id
   where df.deliverable_version_id=v_version and fa.status<>'ready') then
  raise exception using errcode='22023',message='published_files_unavailable'; end if;
 insert into public.client_publications(deliverable_id,project_id,version_id,published_by,idempotency_key)
  values(deliverable_id,v_d.project_id,v_version,v_actor,idempotency_key) returning id into v_publication;
 insert into public.client_reviews(publication_id) values(v_publication) returning id into v_review;
 insert into public.client_review_assignments(client_review_id,reviewer_id)
 select v_review,pm.user_id from public.project_memberships pm
 join public.projects p on p.id=pm.project_id join public.brands b on b.id=p.brand_id
 join public.client_memberships cm on cm.organization_id=b.organization_id and cm.user_id=pm.user_id
 where pm.project_id=v_d.project_id and pm.member_type='client' and pm.status='active'
  and cm.status='active' and cm.role_key='client_reviewer';
 get diagnostics v_count=row_count;
 if v_count=0 then raise exception using errcode='22023',message='client_reviewers_missing'; end if;
 update public.deliverables set status='published_to_client',publish_key=idempotency_key,
  published_by=v_actor,published_at=now(),published_version_id=v_version where id=deliverable_id;
 v_event:=app_private.phase7_event(v_d.work_item_id,'deliverable.published_to_client',v_actor,
  'deliverable',deliverable_id,v_correlation,idempotency_key,
  jsonb_build_object('publication_id',v_publication,'version_id',v_version));
 insert into public.notifications(recipient_id,domain_event_id,kind,project_id,deliverable_id)
 select pm.user_id,v_event,'deliverable_published',v_d.project_id,deliverable_id
 from public.project_memberships pm where pm.project_id=v_d.project_id
  and pm.member_type='client' and pm.status='active'
  and app_private.client_project_access(v_d.project_id,pm.user_id);
 insert into public.notifications(recipient_id,domain_event_id,kind,project_id,deliverable_id)
 select a.reviewer_id,v_event,'approval_pending',v_d.project_id,deliverable_id
 from public.client_review_assignments a where a.client_review_id=v_review;
 return deliverable_id;
end; $$;

create function public.portal_projects(page_limit integer default 20,page_offset integer default 0)
returns table(project_id uuid,project_name text,project_status text,brand_name text,
 start_date date,target_end_date date,milestones_done bigint,milestones_total bigint,
 next_milestone_date date,published_count bigint,pending_approvals bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or page_limit not between 1 and 100 or page_offset<0 then
  raise exception using errcode='22023',message='invalid_portal_page'; end if;
 return query select p.id,p.name,p.status,b.name,p.start_date,p.target_end_date,
  (select count(*) from public.milestones m where m.project_id=p.id and m.archived_at is null and m.status in ('completed','closed')),
  (select count(*) from public.milestones m where m.project_id=p.id and m.archived_at is null),
  (select min(m.due_date) from public.milestones m where m.project_id=p.id and m.archived_at is null
   and m.status in ('planned','in_progress') and m.due_date>=current_date),
  (select count(*) from public.client_publications cp where cp.project_id=p.id),
  (select count(*) from public.client_review_assignments a
   join public.client_reviews cr on cr.id=a.client_review_id
   join public.client_publications cp on cp.id=cr.publication_id
   where cp.project_id=p.id and a.reviewer_id=auth.uid() and a.status='pending' and cr.status='pending')
 from public.projects p join public.brands b on b.id=p.brand_id
 where app_private.client_project_access(p.id)
 order by p.name,p.id limit page_limit offset page_offset;
end; $$;

create function public.portal_project_detail(project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare v_result jsonb;
begin
 if not app_private.client_project_access(project_id) then
  raise exception using errcode='42501',message='client_project_forbidden'; end if;
 select jsonb_build_object('id',p.id,'name',p.name,'status',p.status,
  'brand_name',b.name,'organization_name',o.name,'start_date',p.start_date,
  'target_end_date',p.target_end_date,'timezone',coalesce(p.timezone,b.timezone,o.timezone),
  'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,
   'status',m.status,'due_date',m.due_date) order by m.sort_order,m.due_date,m.id)
   from public.milestones m where m.project_id=p.id and m.archived_at is null),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(jsonb_build_object('publication_id',x.id,
   'title',x.title,'published_at',x.published_at,'review_status',x.review_status)
   order by x.published_at desc,x.id desc) from (select cp.id,d.title,cp.published_at,cr.status review_status
    from public.client_publications cp join public.deliverables d on d.id=cp.deliverable_id
    join public.client_reviews cr on cr.publication_id=cp.id where cp.project_id=p.id
    order by cp.published_at desc,cp.id desc limit 20) x),'[]'::jsonb))
 into v_result from public.projects p join public.brands b on b.id=p.brand_id
 join public.organizations o on o.id=b.organization_id where p.id=project_id;
 return v_result;
end; $$;

create function public.portal_deliverables(p_project_id uuid default null,page_limit integer default 20,page_offset integer default 0)
returns table(publication_id uuid,deliverable_id uuid,project_id uuid,project_name text,brand_name text,
 title text,version_number integer,published_at timestamptz,review_status text,
 my_assignment_id uuid,my_assignment_status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or page_limit not between 1 and 100 or page_offset<0 then
  raise exception using errcode='22023',message='invalid_portal_page'; end if;
 return query select cp.id,d.id,p.id,p.name,b.name,d.title,dv.version_number,cp.published_at,
  cr.status,a.id,a.status from public.client_publications cp
 join public.deliverables d on d.id=cp.deliverable_id
 join public.deliverable_versions dv on dv.id=cp.version_id
 join public.projects p on p.id=cp.project_id join public.brands b on b.id=p.brand_id
 join public.client_reviews cr on cr.publication_id=cp.id
 left join public.client_review_assignments a on a.client_review_id=cr.id and a.reviewer_id=auth.uid()
 where (p_project_id is null or cp.project_id=p_project_id)
  and app_private.client_project_access(cp.project_id)
 order by cp.published_at desc,cp.id desc limit page_limit offset page_offset;
end; $$;

create function public.portal_approvals(page_limit integer default 20,page_offset integer default 0)
returns table(assignment_id uuid,publication_id uuid,deliverable_id uuid,project_id uuid,
 project_name text,title text,version_number integer,published_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or page_limit not between 1 and 100 or page_offset<0 then
  raise exception using errcode='22023',message='invalid_portal_page'; end if;
 return query select a.id,cp.id,d.id,p.id,p.name,d.title,dv.version_number,cp.published_at
 from public.client_review_assignments a
 join public.client_reviews cr on cr.id=a.client_review_id
 join public.client_publications cp on cp.id=cr.publication_id
 join public.deliverables d on d.id=cp.deliverable_id
 join public.deliverable_versions dv on dv.id=cp.version_id
 join public.projects p on p.id=cp.project_id
 where a.reviewer_id=auth.uid() and a.status='pending' and cr.status='pending'
  and d.status='published_to_client' and d.published_version_id=cp.version_id
  and app_private.client_reviewer_access(cp.project_id)
 order by cp.published_at,a.id limit page_limit offset page_offset;
end; $$;

create function public.portal_deliverable_detail(publication_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare v_cp public.client_publications%rowtype; v_result jsonb;
begin
 select * into v_cp from public.client_publications cp where cp.id=publication_id;
 if v_cp.id is null or not app_private.client_project_access(v_cp.project_id) then
  raise exception using errcode='42501',message='client_deliverable_forbidden'; end if;
 select jsonb_build_object('publication_id',cp.id,'deliverable_id',d.id,'project_id',p.id,
  'project_name',p.name,'brand_name',b.name,'title',d.title,
  'version_number',dv.version_number,'published_at',cp.published_at,
  'review_status',cr.status,'my_assignment_id',a.id,'my_assignment_status',a.status,
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',fa.id,
   'bucket_id',fa.bucket_id,'object_path',fa.object_path,
   'original_filename',fa.original_filename,'mime_type',fa.mime_type,
   'size_bytes',fa.size_bytes) order by df.ordinal)
   from public.deliverable_files df join public.file_assets fa on fa.id=df.asset_id
   where df.deliverable_version_id=cp.version_id and fa.status='ready'),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(jsonb_build_object('id',cf.id,'body',cf.body,
   'created_at',cf.created_at,'author_name',coalesce(pr.display_name,'Cliente'))
   order by cf.created_at,cf.id) from public.client_feedback cf
   left join public.profiles pr on pr.user_id=cf.author_id where cf.publication_id=cp.id),'[]'::jsonb))
 into v_result from public.client_publications cp
 join public.deliverables d on d.id=cp.deliverable_id
 join public.deliverable_versions dv on dv.id=cp.version_id
 join public.projects p on p.id=cp.project_id join public.brands b on b.id=p.brand_id
 join public.client_reviews cr on cr.publication_id=cp.id
 left join public.client_review_assignments a on a.client_review_id=cr.id and a.reviewer_id=auth.uid()
 where cp.id=publication_id;
 return v_result;
end; $$;

create function public.portal_documents(p_project_id uuid default null,page_limit integer default 20,page_offset integer default 0)
returns table(asset_id uuid,publication_id uuid,project_id uuid,project_name text,deliverable_title text,
 version_number integer,original_filename text,mime_type text,size_bytes bigint,bucket_id text,
 object_path text,published_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or page_limit not between 1 and 100 or page_offset<0 then
  raise exception using errcode='22023',message='invalid_portal_page'; end if;
 return query select fa.id,cp.id,p.id,p.name,d.title,dv.version_number,
  fa.original_filename,fa.mime_type,fa.size_bytes,fa.bucket_id,fa.object_path,cp.published_at
 from public.client_publications cp join public.deliverable_versions dv on dv.id=cp.version_id
 join public.deliverables d on d.id=cp.deliverable_id join public.projects p on p.id=cp.project_id
 join public.deliverable_files df on df.deliverable_version_id=cp.version_id
 join public.file_assets fa on fa.id=df.asset_id
 where (p_project_id is null or cp.project_id=p_project_id)
  and fa.status='ready' and fa.mime_type not like 'image/%' and fa.mime_type not like 'video/%'
  and app_private.client_project_access(cp.project_id)
 order by cp.published_at desc,cp.id desc,df.ordinal limit page_limit offset page_offset;
end; $$;

create function public.mark_portal_notification_read(notification_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception using errcode='42501',message='notification_forbidden'; end if;
 update public.notifications set read_at=coalesce(read_at,now())
 where id=notification_id and recipient_id=auth.uid();
 if not found then raise exception using errcode='42501',message='notification_forbidden'; end if;
end; $$;

create function public.record_client_decision(assignment_id uuid,decision text,reason text,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare v_actor uuid:=auth.uid(); v_d public.deliverables%rowtype; v_cp public.client_publications%rowtype;
 v_review public.client_reviews%rowtype; v_a public.client_review_assignments%rowtype;
 v_prior public.client_review_decisions%rowtype; v_id uuid; v_event uuid; v_type text;
begin
 if v_actor is null or idempotency_key is null or decision not in ('approve','request_changes')
   or (decision='request_changes' and char_length(btrim(coalesce(reason,''))) not between 1 and 4000)
   or (reason is not null and char_length(reason)>4000) then
  raise exception using errcode='22023',message='invalid_client_decision'; end if;
 select d.* into v_d from public.client_review_assignments a
 join public.client_reviews cr on cr.id=a.client_review_id
 join public.client_publications cp on cp.id=cr.publication_id
 join public.deliverables d on d.id=cp.deliverable_id where a.id=assignment_id for update of d;
 if v_d.id is null then raise exception using errcode='42501',message='client_decision_forbidden'; end if;
 select cr.* into v_review from public.client_review_assignments a
  join public.client_reviews cr on cr.id=a.client_review_id where a.id=assignment_id for update of cr;
 select * into v_a from public.client_review_assignments a where a.id=assignment_id for update;
 select cp.* into v_cp from public.client_publications cp where cp.id=v_review.publication_id;
 if v_a.reviewer_id<>v_actor or not app_private.client_reviewer_access(v_cp.project_id,v_actor) then
  raise exception using errcode='42501',message='client_decision_forbidden'; end if;
 select * into v_prior from public.client_review_decisions cd where cd.reviewer_id=v_actor
  and cd.idempotency_key=idempotency_key;
 if v_prior.id is not null then
  if v_prior.assignment_id<>assignment_id or v_prior.decision<>decision or v_prior.reason is distinct from nullif(btrim(reason),'') then
   raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
  return v_prior.id;
 end if;
 if v_d.status<>'published_to_client' or v_d.published_version_id<>v_cp.version_id
   or v_review.status<>'pending' or v_a.status<>'pending' then
  raise exception using errcode='22023',message='client_review_closed'; end if;
 insert into public.client_review_decisions(assignment_id,reviewer_id,decision,reason,idempotency_key)
  values(assignment_id,v_actor,decision,nullif(btrim(reason),''),idempotency_key) returning id into v_id;
 update public.client_review_assignments set status=case when decision='approve' then 'approved' else 'changes_requested' end,
  resolved_at=now() where id=assignment_id;
 v_type:=case when decision='approve' then 'client.review.approved' else 'client.review.changes_requested' end;
 v_event:=app_private.phase7_event(v_d.work_item_id,v_type,v_actor,'client_review_decision',v_id,
  gen_random_uuid(),idempotency_key,jsonb_build_object('deliverable_id',v_d.id,'version_id',v_cp.version_id));
 if decision='request_changes' then
  update public.client_reviews set status='changes_requested',closed_at=now() where id=v_review.id;
  update public.deliverables set status='changes_requested' where id=v_d.id;
  update public.work_items set status='in_progress',completed_at=null where id=v_d.work_item_id;
 elsif not exists(select 1 from public.client_review_assignments a where a.client_review_id=v_review.id and a.status='pending') then
  update public.client_reviews set status='approved',closed_at=now() where id=v_review.id;
  update public.deliverables set status='client_approved' where id=v_d.id;
 end if;
 insert into public.notifications(recipient_id,domain_event_id,kind,project_id,deliverable_id)
 select distinct pm.user_id,v_event,
  case when decision='approve' then 'client_approved' else 'client_changes_requested' end,
  v_d.project_id,v_d.id from public.project_memberships pm
 where pm.project_id=v_d.project_id and pm.member_type='internal' and pm.status='active'
  and (decision='request_changes' or not exists(select 1 from public.client_review_assignments pending
   where pending.client_review_id=v_review.id and pending.status='pending'));
 return v_id;
end; $$;

create function public.add_client_feedback(publication_id uuid,body text,idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare v_actor uuid:=auth.uid(); v_cp public.client_publications%rowtype;
 v_prior public.client_feedback%rowtype; v_id uuid;
begin
 if v_actor is null or idempotency_key is null or char_length(btrim(coalesce(body,''))) not between 1 and 4000 then
  raise exception using errcode='22023',message='invalid_client_feedback'; end if;
 select * into v_cp from public.client_publications cp where cp.id=publication_id;
 if v_cp.id is null or not app_private.client_project_access(v_cp.project_id,v_actor) then
  raise exception using errcode='42501',message='client_feedback_forbidden'; end if;
 select * into v_prior from public.client_feedback cf where cf.author_id=v_actor and cf.idempotency_key=idempotency_key;
 if v_prior.id is not null then
  if v_prior.publication_id<>publication_id or v_prior.body<>btrim(body) then
   raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
  return v_prior.id;
 end if;
 insert into public.client_feedback(publication_id,author_id,body,idempotency_key)
  values(publication_id,v_actor,btrim(body),idempotency_key) returning id into v_id;
 perform app_private.phase7_event((select d.work_item_id from public.deliverables d where d.id=v_cp.deliverable_id),
  'client.feedback.added',v_actor,'client_feedback',v_id,gen_random_uuid(),idempotency_key,
  jsonb_build_object('publication_id',publication_id));
 return v_id;
end; $$;

create function public.internal_client_review_history(work_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare v_d public.deliverables%rowtype;
begin
 select * into v_d from public.deliverables d where d.work_item_id=work_item_id;
 if v_d.id is null or not (app_private.phase7_read_allowed(v_d.id)
  or app_private.project_permission(v_d.project_id,'deliverable.publish')) then
  raise exception using errcode='42501',message='client_history_forbidden'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('publication_id',cp.id,
  'version_number',dv.version_number,'published_at',cp.published_at,'review_status',cr.status,
  'decisions',coalesce((select jsonb_agg(jsonb_build_object('decision',cd.decision,
   'reason',cd.reason,'decided_at',cd.decided_at,'reviewer_name',coalesce(pr.display_name,'Cliente'))
   order by cd.decided_at,cd.id) from public.client_review_assignments a
   join public.client_review_decisions cd on cd.assignment_id=a.id
   left join public.profiles pr on pr.user_id=cd.reviewer_id where a.client_review_id=cr.id),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(jsonb_build_object('body',cf.body,'created_at',cf.created_at,
   'author_name',coalesce(pr.display_name,'Cliente')) order by cf.created_at,cf.id)
   from public.client_feedback cf left join public.profiles pr on pr.user_id=cf.author_id
   where cf.publication_id=cp.id),'[]'::jsonb)) order by cp.published_at desc,cp.id desc)
 from public.client_publications cp join public.deliverable_versions dv on dv.id=cp.version_id
 join public.client_reviews cr on cr.publication_id=cp.id where cp.deliverable_id=v_d.id),'[]'::jsonb);
end; $$;

create or replace function app_private.file_storage_read(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.file_assets fa where fa.bucket_id=p_bucket and fa.object_path=p_path
  and ((fa.status in ('ready','archived') and app_private.project_permission(fa.project_id,'file.view'))
    or (fa.status='deleting' and app_private.file_director_permission(fa.project_id))
    or app_private.client_asset_access(fa.id)));
$$;

create function app_private.phase9_history_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='23514',message='client_history_immutable'; end if;
 if tg_table_name='client_reviews' then
  if old.status<>'pending' or new.status not in ('approved','changes_requested')
   or (new.id,new.publication_id,new.context,new.opened_at)
   is distinct from (old.id,old.publication_id,old.context,old.opened_at)
   or new.closed_at is null then
   raise exception using errcode='23514',message='client_history_immutable'; end if;
 elsif tg_table_name='client_review_assignments' then
  if old.status<>'pending' or new.status not in ('approved','changes_requested')
   or (new.id,new.client_review_id,new.reviewer_id,new.assigned_at)
   is distinct from (old.id,old.client_review_id,old.reviewer_id,old.assigned_at)
   or new.resolved_at is null then
   raise exception using errcode='23514',message='client_history_immutable'; end if;
 else raise exception using errcode='23514',message='client_history_immutable'; end if;
 return new;
end; $$;
create trigger client_publications_immutable before update or delete on public.client_publications
 for each row execute function app_private.phase9_history_guard();
create trigger client_reviews_guard before update or delete on public.client_reviews
 for each row execute function app_private.phase9_history_guard();
create trigger client_review_assignments_guard before update or delete on public.client_review_assignments
 for each row execute function app_private.phase9_history_guard();
create trigger client_review_decisions_immutable before update or delete on public.client_review_decisions
 for each row execute function app_private.phase9_history_guard();
create trigger client_feedback_immutable before update or delete on public.client_feedback
 for each row execute function app_private.phase9_history_guard();

alter table public.client_publications enable row level security;
alter table public.client_publications force row level security;
alter table public.client_reviews enable row level security;
alter table public.client_reviews force row level security;
alter table public.client_review_assignments enable row level security;
alter table public.client_review_assignments force row level security;
alter table public.client_review_decisions enable row level security;
alter table public.client_review_decisions force row level security;
alter table public.client_feedback enable row level security;
alter table public.client_feedback force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
create policy notifications_read_self on public.notifications for select to authenticated
 using (recipient_id=(select auth.uid()) and
  (app_private.client_project_access(project_id) or app_private.project_permission(project_id,'project.view')));
revoke all on public.client_publications,public.client_reviews,public.client_review_assignments,
 public.client_review_decisions,public.client_feedback,public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;

revoke all on function app_private.phase9_history_guard() from public,anon,authenticated,service_role;
grant execute on function app_private.client_project_access(uuid,uuid),
 app_private.client_reviewer_access(uuid,uuid),app_private.client_asset_access(uuid,uuid),
 app_private.project_permission(uuid,text) to authenticated;
revoke execute on function public.publish_deliverable_to_client(uuid,uuid),
 public.record_client_decision(uuid,text,text,uuid),public.add_client_feedback(uuid,text,uuid),
 public.portal_projects(integer,integer),public.portal_project_detail(uuid),
 public.portal_deliverables(uuid,integer,integer),public.portal_approvals(integer,integer),
 public.portal_deliverable_detail(uuid),public.portal_documents(uuid,integer,integer),
 public.mark_portal_notification_read(uuid),public.internal_client_review_history(uuid)
 from public,anon;
grant execute on function public.publish_deliverable_to_client(uuid,uuid),
 public.record_client_decision(uuid,text,text,uuid),public.add_client_feedback(uuid,text,uuid),
 public.portal_projects(integer,integer),public.portal_project_detail(uuid),
 public.portal_deliverables(uuid,integer,integer),public.portal_approvals(integer,integer),
 public.portal_deliverable_detail(uuid),public.portal_documents(uuid,integer,integer),
 public.mark_portal_notification_read(uuid),public.internal_client_review_history(uuid)
 to authenticated;

comment on function public.portal_deliverable_detail(uuid) is
 'Client projection of exactly one published version; internal notes and review history are excluded.';
