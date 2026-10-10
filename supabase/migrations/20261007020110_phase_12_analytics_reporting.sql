-- Phase 12: bounded, descriptive read models over canonical operational data.
insert into public.capabilities(key,description,resource_scope_required) values
 ('analytics.view','Read operational aggregates in authorized Projects.',true),
 ('analytics.view_billing','Read operational billing aggregates with billing.view.',true),
 ('analytics.export','Export the currently authorized analytics query.',true),
 ('report.publish','Publish or withdraw a dynamic client-safe Project report.',true),
 ('report.view_client','Read explicitly published reports with client Project membership.',true);
insert into public.role_capabilities(role_key,capability_key)
 select 'agency_director',key from public.capabilities where key in
 ('analytics.view','analytics.view_billing','analytics.export','report.publish');
insert into public.role_capabilities(role_key,capability_key) values ('project_manager','analytics.view');
insert into public.role_capabilities(role_key,capability_key)
 select key,'report.view_client' from public.roles where key in ('client_admin','client_reviewer','client_viewer');

create function app_private.analytics_validate(p_from date,p_to date,p_limit integer default 20,p_offset integer default 0)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365
  or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then
  raise exception using errcode='22023',message='invalid_analytics_range_or_page'; end if;
end; $$;

-- Billing is a distinct capability boundary. Preaggregate payments by document;
-- never join line items to totals. Org-only documents require Director scope.
create function app_private.analytics_billing_rows(p_from date,p_to date,p_agency uuid,p_organization uuid,
 p_brand uuid,p_project uuid,p_currency text)
returns table(id uuid,number text,project_id uuid,document_date date,due_date date,currency text,
 status text,total_amount numeric,paid_amount numeric,remaining_amount numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.analytics_validate(p_from,p_to);
 if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
  raise exception using errcode='22023',message='invalid_analytics_currency'; end if;
 -- Validate the same operational scope, then require the extra financial permission.
 perform 1 from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project);
 if not exists(select 1 from public.my_capabilities() c where c.capability_key='analytics.view_billing')
  or not exists(select 1 from public.my_capabilities() c where c.capability_key='billing.view')
  or (p_project is not null and (not app_private.project_permission(p_project,'analytics.view_billing') or not app_private.project_permission(p_project,'billing.view'))) then
  raise exception using errcode='42501',message='analytics_billing_forbidden'; end if;
 return query with scope as materialized (select s.* from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project) s
  where app_private.project_permission(s.project_id,'analytics.view_billing') and app_private.project_permission(s.project_id,'billing.view')),
 docs as materialized (select d.* from public.billing_documents d join public.organizations o on o.id=d.organization_id
  where d.status in ('issued','partially_paid','paid') and d.date between p_from and p_to
   and (p_currency is null or d.currency=p_currency) and (p_agency is null or o.agency_id=p_agency)
   and (p_organization is null or o.id=p_organization) and (p_project is null or d.project_id=p_project)
   and (p_brand is null or coalesce((select p.brand_id from public.projects p where p.id=d.project_id),d.brand_id)=p_brand)
   and ((d.project_id is not null and exists(select 1 from scope s where s.project_id=d.project_id))
    or (d.project_id is null and p_project is null and public.has_capability('analytics.view_billing',o.agency_id,o.id)
     and public.has_capability('billing.view',o.agency_id,o.id) and exists(select 1 from public.agency_memberships am
      where am.agency_id=o.agency_id and am.user_id=auth.uid() and am.status='active' and am.role_key='agency_director')))),
 payments as (select pr.billing_document_id,sum(pr.amount) as paid from public.payment_records pr join docs d on d.id=pr.billing_document_id
  where pr.voided_at is null and pr.currency=d.currency group by pr.billing_document_id)
 select d.id,d.number,d.project_id,d.date,d.due_date,d.currency,d.status::text,d.total_amount,
  coalesce(pr.paid,0),greatest(d.total_amount-coalesce(pr.paid,0),0)
 from docs d left join payments pr on pr.billing_document_id=d.id;
end; $$;

create function public.analytics_billing(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null,p_currency text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 with docs as materialized (select * from app_private.analytics_billing_rows(p_from,p_to,p_agency,p_organization,p_brand,p_project,p_currency)),
 groups as (select currency,sum(total_amount) as issued_amount,sum(paid_amount) as paid_amount,sum(remaining_amount) as remaining_amount,
 count(*) filter(where status='partially_paid') as partially_paid,count(*) filter(where status='paid') as paid,
 count(*) filter(where due_date<(now() at time zone 'America/Mexico_City')::date and remaining_amount>0) as overdue,
 count(*) filter(where due_date between (now() at time zone 'America/Mexico_City')::date and (now() at time zone 'America/Mexico_City')::date+7 and remaining_amount>0) as upcoming_due
 from docs group by currency order by currency)
 select jsonb_build_object('currencies',coalesce(jsonb_agg(to_jsonb(groups)),'[]'::jsonb),'as_of',now()) into result from groups;
 return result;
end; $$;

create function public.analytics_billing_details(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null,p_currency text default null,
 p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(p_from,p_to,p_limit,p_offset);
 with docs as materialized (select * from app_private.analytics_billing_rows(p_from,p_to,p_agency,p_organization,p_brand,p_project,p_currency)),
 rows as (select * from docs order by due_date nulls last,id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb),'total',(select count(*) from docs),'as_of',now()) into result from rows;
 return result;
end; $$;

-- Reports publish access to a dynamic safe projection, never a financial or
-- internal snapshot. The immutable report window and title identify its purpose.
create table public.project_reports (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 title text not null check(char_length(btrim(title)) between 1 and 160),
 from_date date not null,to_date date not null,
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 created_at timestamptz not null default now(),
 published_at timestamptz,published_by uuid references public.profiles(user_id) on delete restrict,
 check(from_date<=to_date and to_date-from_date<=365),
 check((published_at is null)=(published_by is null))
);
create index project_reports_project_created_idx on public.project_reports(project_id,created_at desc,id);
create function app_private.client_report_access(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.client_project_access(p_project) and public.has_capability('report.view_client',null,
  (select b.organization_id from public.projects p join public.brands b on b.id=p.brand_id where p.id=p_project));
$$;
alter table public.project_reports enable row level security;
alter table public.project_reports force row level security;
revoke all on public.project_reports from public,anon,authenticated;
grant select(id,project_id,title,from_date,to_date,created_at,published_at) on public.project_reports to authenticated;
grant all on public.project_reports to service_role;
create policy project_reports_internal_read on public.project_reports for select to authenticated
 using(public.is_internal_actor() and public.project_access_allowed(project_id,'analytics.view'));
create policy project_reports_client_read on public.project_reports for select to authenticated
 using(published_at is not null and app_private.client_report_access(project_id));

create function public.create_project_report(p_project uuid,p_title text,p_from date,p_to date)
returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
 perform app_private.analytics_validate(p_from,p_to);
 perform 1 from app_private.analytics_scope(null,null,null,p_project);
 if not app_private.project_permission(p_project,'report.publish') then
  raise exception using errcode='42501',message='report_publish_forbidden'; end if;
 insert into public.project_reports(project_id,title,from_date,to_date,created_by)
 values(p_project,btrim(p_title),p_from,p_to,auth.uid()) returning id into report_id;
 return report_id;
end; $$;

create function public.set_project_report_publication(p_report uuid,p_publish boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare report public.project_reports%rowtype;
begin
 select * into report from public.project_reports where id=p_report for update;
 if report.id is null or p_publish is null or not app_private.project_permission(report.project_id,'report.publish') then
  raise exception using errcode='42501',message='report_publish_forbidden'; end if;
 if (report.published_at is not null)=p_publish then return p_report; end if;
 update public.project_reports set published_at=case when p_publish then now() end,
 published_by=case when p_publish then auth.uid() end where id=p_report;
 perform app_private.record_editorial_event(report.project_id,case when p_publish then 'report.published' else 'report.withdrawn' end,
  'project_report',p_report,auth.uid(),gen_random_uuid(),null,jsonb_build_object('report_id',p_report));
 return p_report;
end; $$;

create function public.list_project_reports(p_project uuid default null,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then
  raise exception using errcode='22023',message='invalid_analytics_range_or_page'; end if;
 if auth.uid() is null then raise exception using errcode='42501',message='report_forbidden'; end if;
 with visible as materialized(select r.id,r.project_id,r.title,r.from_date,r.to_date,r.published_at,r.created_at
 from public.project_reports r where p_project is null or r.project_id=p_project),
 rows as (select * from visible order by created_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb),'total',(select count(*) from visible)) into result from rows;
 return result;
end; $$;

create function public.client_project_report(p_report uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report public.project_reports%rowtype; result jsonb;
begin
 select * into report from public.project_reports r where r.id=p_report and r.published_at is not null;
 if report.id is null or not app_private.client_project_access(report.project_id) or not public.has_capability('report.view_client',null,
  (select b.organization_id from public.projects p join public.brands b on b.id=p.brand_id where p.id=report.project_id)) then
  raise exception using errcode='42501',message='report_forbidden'; end if;
 select jsonb_build_object('id',report.id,'title',report.title,'project_id',p.id,'project_name',p.name,'project_status',p.status,
 'from',report.from_date,'to',report.to_date,'published_at',report.published_at,'as_of',now(),'semantics','current_report',
 'milestones_done',(select count(*) from public.milestones m where m.project_id=p.id and m.archived_at is null and m.status in ('completed','closed')),
 'milestones_pending',(select count(*) from public.milestones m where m.project_id=p.id and m.archived_at is null and m.status in ('planned','in_progress')),
 'published_deliverables',(select count(distinct cp.deliverable_id) from public.client_publications cp where cp.project_id=p.id
  and cp.published_at>=report.from_date::timestamp at time zone 'America/Mexico_City' and cp.published_at<(report.to_date+1)::timestamp at time zone 'America/Mexico_City'),
 'approvals',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from
  (select cr.status,count(*) n from public.client_reviews cr join public.client_publications cp on cp.id=cr.publication_id
   where cp.project_id=p.id and cp.published_at>=report.from_date::timestamp at time zone 'America/Mexico_City'
    and cp.published_at<(report.to_date+1)::timestamp at time zone 'America/Mexico_City' group by cr.status) x),
 'published_documents',(select count(*) from public.billing_documents d where d.project_id=p.id and d.published_to_client and d.status in ('issued','partially_paid','paid')
  and d.published_at>=report.from_date::timestamp at time zone 'America/Mexico_City' and d.published_at<(report.to_date+1)::timestamp at time zone 'America/Mexico_City'))
 into result from public.projects p where p.id=report.project_id;
 return result;
end; $$;

-- Export is a separate server check and calls exactly the visible read model.
-- Payload is bounded aggregates (not arbitrary datasets), encoded safely as CSV
-- by the client. All text, including category labels, is escaped there.
create function public.export_analytics(p_section text,p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null,p_currency text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.analytics_validate(p_from,p_to);
 perform 1 from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project);
 if not exists(select 1 from public.my_capabilities() c where c.capability_key='analytics.export') or exists(select 1 from
  app_private.analytics_scope(p_agency,p_organization,p_brand,p_project) s where not app_private.project_permission(s.project_id,'analytics.export')) then
  raise exception using errcode='42501',message='analytics_export_forbidden'; end if;
 case p_section
  when 'overview' then return public.analytics_overview(p_from,p_to,p_agency,p_organization,p_brand,p_project);
  when 'work' then return public.analytics_work(p_from,p_to,p_agency,p_organization,p_brand,p_project);
  when 'editorial' then return public.analytics_editorial(p_from,p_to,p_agency,p_organization,p_brand,p_project);
  when 'reviews' then return public.analytics_reviews(p_from,p_to,p_agency,p_organization,p_brand,p_project);
  when 'billing' then return public.analytics_billing(p_from,p_to,p_agency,p_organization,p_brand,p_project,p_currency);
  else raise exception using errcode='22023',message='invalid_analytics_export';
 end case;
end; $$;

-- This helper is private, runs with explicit actor/resource authorization, and
-- materializes the permitted Project set once per aggregate query (not per row).
create function app_private.analytics_scope(p_agency uuid,p_organization uuid,p_brand uuid,p_project uuid,
 p_capability text default 'analytics.view')
returns table(project_id uuid,project_name text,project_status text,brand_id uuid,brand_name text,
 organization_id uuid,organization_name text,agency_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_internal_actor() or not exists(select 1 from public.my_capabilities() c where c.capability_key=p_capability) then
  raise exception using errcode='42501',message='analytics_forbidden'; end if;
 if p_project is not null and not app_private.project_permission(p_project,p_capability) then
  raise exception using errcode='42501',message='analytics_scope_forbidden'; end if;
 if p_agency is not null and not exists(select 1 from public.agency_memberships am
  where am.agency_id=p_agency and am.user_id=auth.uid() and am.status='active') then
  raise exception using errcode='42501',message='analytics_scope_forbidden'; end if;
 return query select p.id,p.name,p.status,b.id,b.name,o.id,o.name,o.agency_id
 from public.projects p join public.brands b on b.id=p.brand_id
 join public.organizations o on o.id=b.organization_id
 join public.agency_memberships am on am.agency_id=o.agency_id and am.user_id=auth.uid() and am.status='active'
 where am.role_key in ('agency_director','project_manager')
  and app_private.project_permission(p.id,p_capability) and app_private.project_permission(p.id,'project.view')
  and (p_agency is null or o.agency_id=p_agency)
  and (p_organization is null or o.id=p_organization)
  and (p_brand is null or b.id=p_brand) and (p_project is null or p.id=p_project);
 -- Never turn an explicit foreign Organization/Brand/Project into an agency total.
 if (p_organization is not null or p_brand is not null or p_project is not null) and not found then
  raise exception using errcode='42501',message='analytics_scope_forbidden'; end if;
end; $$;

create function public.analytics_filter_options(p_agency uuid default null,p_organization uuid default null,
 p_brand uuid default null,p_search text default '',p_limit integer default 50,p_offset integer default 0,p_kind text default 'project')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(current_date,current_date,p_limit,p_offset);
 if p_search is null or char_length(p_search)>100 or p_kind is null or p_kind not in ('organization','brand','project') then
  raise exception using errcode='22023',message='invalid_analytics_search'; end if;
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,null)),
 catalog as materialized(select distinct
  case p_kind when 'organization' then organization_id when 'brand' then brand_id else project_id end as id,
  case p_kind when 'organization' then organization_name when 'brand' then brand_name else project_name end as name from scope),
 options as (select * from catalog where name ilike '%'||p_search||'%'
  order by name,id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(options)),'[]'::jsonb),
  'total',(select count(*) from catalog where name ilike '%'||p_search||'%')) into result from options;
 return result;
end; $$;

create function public.analytics_overview(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(p_from,p_to);
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project)),
 work as materialized (select w.* from public.work_items w join scope s on s.project_id=w.project_id where w.archived_at is null),
 deliveries as (select d.* from public.deliverables d join scope s on s.project_id=d.project_id where d.archived_at is null)
 select jsonb_build_object('active_projects',(select count(*) from scope where project_status='active'),
 'active_clients',(select count(distinct s.organization_id) from scope s join public.organizations o on o.id=s.organization_id where o.lifecycle='active_client'),
 'open_work',(select count(*) from work where status not in ('done','cancelled')),
 'overdue_work',(select count(*) from work where status not in ('done','cancelled') and due_at<now()),
 'blocked_work',(select count(*) from work where status='blocked'),
 'pending_internal',(select count(*) from deliveries where status='in_review'),
 'pending_client',(select count(*) from public.client_reviews r join public.client_publications cp on cp.id=r.publication_id
  join scope s on s.project_id=cp.project_id where r.status='pending'),
 'completed_period',(select count(*) from work where status='done' and completed_at>=p_from::timestamp at time zone 'America/Mexico_City'
  and completed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'completed_previous',(select count(*) from work where status='done' and completed_at>=(p_from-(p_to-p_from+1))::timestamp at time zone 'America/Mexico_City'
  and completed_at<p_from::timestamp at time zone 'America/Mexico_City'),
 'as_of',now(),'from',p_from,'to',p_to) into result;
 return result;
end; $$;

create function public.analytics_projects(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null,
 p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(p_from,p_to,p_limit,p_offset);
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project)),
 work as (select w.project_id,count(*) filter(where w.status not in ('done','cancelled')) as open_work,
  count(*) filter(where w.status='blocked') as blocked_work,
  count(*) filter(where w.status not in ('done','cancelled') and w.due_at<now()) as overdue_work,
  count(*) filter(where w.completed_at>=p_from::timestamp at time zone 'America/Mexico_City' and w.completed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City') as completed_period
  from public.work_items w join scope s on s.project_id=w.project_id where w.archived_at is null group by w.project_id),
 milestones as (select m.project_id,count(*) filter(where m.status in ('completed','closed')) as done,
  count(*) filter(where m.status in ('planned','in_progress')) as pending
  from public.milestones m join scope s on s.project_id=m.project_id where m.archived_at is null group by m.project_id),
 activity as (select w.project_id,count(*) as activity_period,max(e.occurred_at) as last_activity
  from public.work_item_events e join public.work_items w on w.id=e.work_item_id join scope s on s.project_id=w.project_id
  where e.occurred_at>=p_from::timestamp at time zone 'America/Mexico_City' and e.occurred_at<(p_to+1)::timestamp at time zone 'America/Mexico_City' group by w.project_id),
 rows as (select s.*,coalesce(w.open_work,0) as open_work,coalesce(w.blocked_work,0) as blocked_work,
  coalesce(w.overdue_work,0) as overdue_work,coalesce(w.completed_period,0) as completed_period,
  coalesce(m.done,0) as milestones_done,coalesce(m.pending,0) as milestones_pending,
  coalesce(a.activity_period,0) as activity_period,a.last_activity
  from scope s left join work w on w.project_id=s.project_id left join milestones m on m.project_id=s.project_id
  left join activity a on a.project_id=s.project_id order by s.project_name,s.project_id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb),'total',(select count(*) from scope),
 'statuses',(select coalesce(jsonb_object_agg(project_status,n),'{}'::jsonb) from (select project_status,count(*) n from scope group by project_status) x),'as_of',now()) into result from rows;
 return result;
end; $$;

create function public.analytics_work(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; bucket text:=case when p_to-p_from<31 then 'day' when p_to-p_from<181 then 'week' else 'month' end;
begin
 perform app_private.analytics_validate(p_from,p_to);
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project)),
 work as materialized (select w.* from public.work_items w join scope s on s.project_id=w.project_id where w.archived_at is null),
 completions as materialized (select * from work where status='done' and completed_at>=p_from::timestamp at time zone 'America/Mexico_City'
  and completed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 days as (select distinct date_trunc(bucket,d)::date as day from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d),
 series as (select days.day,count(c.id) as count from days left join completions c
  on date_trunc(bucket,c.completed_at at time zone 'America/Mexico_City')::date=days.day group by days.day order by days.day)
 select jsonb_build_object('statuses',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from work group by status) x),
 'priorities',(select coalesce(jsonb_object_agg(priority,n),'{}'::jsonb) from (select priority,count(*) n from work where status not in ('done','cancelled') group by priority) x),
 'completed_period',(select count(*) from completions),
 'median_completion_days',(select round((percentile_cont(0.5) within group(order by extract(epoch from completed_at-created_at)/86400))::numeric,1) from completions where completed_at>=created_at),
 'median_open_age_days',(select round((percentile_cont(0.5) within group(order by extract(epoch from now()-created_at)/86400))::numeric,1) from work where status not in ('done','cancelled') and created_at<=now()),
 'series',(select coalesce(jsonb_agg(to_jsonb(series)),'[]'::jsonb) from series),'bucket',bucket,'as_of',now()) into result;
 return result;
end; $$;

create function public.analytics_work_details(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null,
 p_filter text default 'overdue',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(p_from,p_to,p_limit,p_offset);
 if p_filter is null or p_filter not in ('open','overdue','blocked','completed') then
  raise exception using errcode='22023',message='invalid_analytics_filter'; end if;
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project)),
 filtered as materialized (select w.id,w.project_id,s.project_name,w.title,w.status,w.priority,w.due_at,w.completed_at from public.work_items w
  join scope s on s.project_id=w.project_id where w.archived_at is null and case p_filter
   when 'open' then w.status not in ('done','cancelled') when 'overdue' then w.status not in ('done','cancelled') and w.due_at<now()
   when 'blocked' then w.status='blocked' when 'completed' then w.status='done'
    and w.completed_at>=p_from::timestamp at time zone 'America/Mexico_City' and w.completed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City' end),
 rows as (select * from filtered order by due_at nulls last,id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb),'total',(select count(*) from filtered),'as_of',now()) into result from rows;
 return result;
end; $$;

create function public.analytics_editorial(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(p_from,p_to);
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project)),
 items as materialized (select e.* from public.editorial_items e join scope s on s.project_id=e.project_id where scheduled_date between p_from and p_to)
 select jsonb_build_object('states',(select coalesce(jsonb_object_agg(planning_state,n),'{}'::jsonb) from (select planning_state,count(*) n from items group by planning_state) x),
 'channels',(select coalesce(jsonb_object_agg(channel,n),'{}'::jsonb) from (select channel,count(*) n from items where archived_at is null group by channel) x),
 'formats',(select coalesce(jsonb_object_agg(format,n),'{}'::jsonb) from (select format,count(*) n from items where archived_at is null group by format) x),'as_of',now()) into result;
 return result;
end; $$;

create function public.analytics_reviews(p_from date,p_to date,p_agency uuid default null,
 p_organization uuid default null,p_brand uuid default null,p_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.analytics_validate(p_from,p_to);
 with scope as materialized (select * from app_private.analytics_scope(p_agency,p_organization,p_brand,p_project)),
 deliveries as materialized (select d.* from public.deliverables d join scope s on s.project_id=d.project_id where d.archived_at is null),
 versions as materialized (select v.* from public.deliverable_versions v join deliveries d on d.id=v.deliverable_id),
 rounds as materialized (select r.* from public.review_rounds r join versions v on v.id=r.deliverable_version_id),
 client as materialized (select r.*,cp.published_at from public.client_reviews r join public.client_publications cp on cp.id=r.publication_id
  join deliveries d on d.id=cp.deliverable_id)
 select jsonb_build_object('statuses',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from deliveries group by status) x),
 'submitted_period',(select count(*) from versions where submitted_at>=p_from::timestamp at time zone 'America/Mexico_City' and submitted_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'internal_approved_period',(select count(*) from rounds where status='approved' and closed_at>=p_from::timestamp at time zone 'America/Mexico_City' and closed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'internal_changes_period',(select count(*) from rounds where status='changes_requested' and closed_at>=p_from::timestamp at time zone 'America/Mexico_City' and closed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'published_period',(select count(*) from client where published_at>=p_from::timestamp at time zone 'America/Mexico_City' and published_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'client_approved_period',(select count(*) from client where status='approved' and closed_at>=p_from::timestamp at time zone 'America/Mexico_City' and closed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'client_changes_period',(select count(*) from client where status='changes_requested' and closed_at>=p_from::timestamp at time zone 'America/Mexico_City' and closed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City'),
 'pending_internal',(select count(*) from rounds where status='pending'),'pending_client',(select count(*) from client where status='pending'),
 'median_internal_hours',(select round((percentile_cont(0.5) within group(order by extract(epoch from closed_at-opened_at)/3600))::numeric,1)
  from rounds where closed_at>=p_from::timestamp at time zone 'America/Mexico_City' and closed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City' and closed_at>=opened_at),
 'median_client_hours',(select round((percentile_cont(0.5) within group(order by extract(epoch from closed_at-opened_at)/3600))::numeric,1)
  from client where closed_at>=p_from::timestamp at time zone 'America/Mexico_City' and closed_at<(p_to+1)::timestamp at time zone 'America/Mexico_City' and closed_at>=opened_at),
 'median_versions',(select percentile_cont(0.5) within group(order by n) from (select count(v.id) n from deliveries d left join versions v on v.deliverable_id=d.id group by d.id) x),'as_of',now()) into result;
 return result;
end; $$;

-- Explicit API privileges; private data-reading helpers cannot be called via API.
do $$
declare fn record;
begin
 for fn in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('analytics_filter_options','analytics_overview','analytics_projects',
  'analytics_work','analytics_work_details','analytics_editorial','analytics_reviews','analytics_billing',
  'analytics_billing_details','create_project_report','set_project_report_publication','list_project_reports',
  'client_project_report','export_analytics'))
  or (n.nspname='app_private' and p.proname in ('analytics_validate','analytics_scope','analytics_billing_rows','client_report_access'))
 loop
  execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
  if fn.nspname='public' or fn.proname in ('analytics_validate','client_report_access') then
   execute format('grant execute on function %s to authenticated',fn.signature);
  end if;
 end loop;
end; $$;

-- Advisor finding from Phase 11: retain the Portal contract while replacing the
-- owner-rights view with an invoker facade over an explicitly scoped safe RPC.
create function public.client_billing_documents()
returns table(id uuid,number text,type public.billing_document_type,status public.billing_document_status,
 organization_id uuid,brand_id uuid,project_id uuid,date date,due_date date,currency text,total_amount numeric,
 published_at timestamptz,total_paid numeric)
language sql stable security definer set search_path='' as $$
 select bd.id,bd.number,bd.type,bd.status,bd.organization_id,bd.brand_id,bd.project_id,bd.date,bd.due_date,
 bd.currency,bd.total_amount,bd.published_at,
 coalesce((select sum(pr.amount) from public.payment_records pr where pr.billing_document_id=bd.id
  and pr.voided_at is null and pr.currency=bd.currency),0)
 from public.billing_documents bd
 where auth.uid() is not null and bd.published_to_client and bd.status in ('issued','partially_paid','paid')
 and ((bd.project_id is not null and app_private.client_project_access(bd.project_id))
  or (bd.project_id is null and exists(select 1 from public.client_memberships cm
   join public.organizations o on o.id=cm.organization_id
   where cm.organization_id=bd.organization_id and cm.user_id=auth.uid() and cm.status='active' and o.lifecycle='active_client')));
$$;
revoke all on function public.client_billing_documents() from public,anon;
grant execute on function public.client_billing_documents() to authenticated;
create or replace view public.client_billing_projections with (security_invoker=true) as
 select id,number,type,status,organization_id,brand_id,project_id,date,due_date,currency,
 total_amount::numeric(14,2) as total_amount,published_at,total_paid from public.client_billing_documents();
revoke all on public.client_billing_projections from public,anon;
grant select on public.client_billing_projections to authenticated;
alter function app_private.freeze_issued_billing_document() set search_path='';
alter function app_private.freeze_issued_billing_document_items() set search_path='';

-- One SELECT policy avoids running two independent permissive policies per row.
drop policy project_reports_internal_read on public.project_reports;
drop policy project_reports_client_read on public.project_reports;
create policy project_reports_read on public.project_reports for select to authenticated
 using((public.is_internal_actor() and public.project_access_allowed(project_id,'analytics.view'))
  or (published_at is not null and app_private.client_report_access(project_id)));
