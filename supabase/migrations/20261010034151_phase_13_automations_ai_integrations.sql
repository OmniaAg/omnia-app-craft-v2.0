-- Phase 13. Project is the smallest executable scope; Organization/Agency are derived.
-- The delivered notification ledger stays intact. Runs are the event-backed outbox
-- for this domain, and webhook deliveries are its external delivery ledger.
insert into public.capabilities(key,description,resource_scope_required) values
 ('automation.view','Inspect authorized Project automation history.',true),
 ('automation.manage','Configure approved Project workflows.',true),
 ('automation.run','Run/retry approved Project workflows.',true),
 ('integration.view','Inspect safe connection and delivery metadata.',true),
 ('integration.manage','Approve/revoke Project webhook connections.',true),
 ('ai.use','Request reviewed, scoped AI assistance.',true),
 ('ai.manage','Manage consent for Project AI assistance.',true);
insert into public.role_capabilities(role_key,capability_key)
 select 'agency_director',key from public.capabilities
 where key in ('automation.view','automation.manage','automation.run','integration.view','integration.manage','ai.use','ai.manage');

create function app_private.p13_permission(p_project uuid,p_actor uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null and exists (
  select 1 from public.projects p join public.brands b on b.id=p.brand_id
  join public.organizations o on o.id=b.organization_id
  join public.agency_memberships am on am.agency_id=o.agency_id and am.user_id=p_actor and am.status='active'
  where p.id=p_project and p.archived_at is null and b.archived_at is null and o.archived_at is null
   and (am.role_key='agency_director' or exists (
    select 1 from public.project_memberships pm where pm.project_id=p.id and pm.user_id=p_actor
     and pm.member_type='internal' and pm.status='active'))
   and (p_capability not in ('integration.manage','ai.manage') or am.role_key='agency_director')
   and (p_capability<>'automation.manage' or am.role_key in ('agency_director','project_manager'))
   and (exists(select 1 from public.role_capabilities rc where rc.role_key=am.role_key and rc.capability_key=p_capability)
    or exists(select 1 from public.capability_grants g where g.user_id=p_actor and g.agency_id=o.agency_id
     and g.capability_key=p_capability and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())
     and (g.scope_kind='agency' or g.organization_id=o.id)))
 );
$$;
create function public.phase13_access(p_project uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select $2 in ('automation.view','automation.manage','automation.run','integration.view','integration.manage','ai.use','ai.manage')
  and app_private.p13_permission($1,(select auth.uid()),$2);
$$;

create table public.integration_connections (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 provider text not null default 'generic_webhook' check(provider='generic_webhook'),
 display_name text not null check(char_length(btrim(display_name)) between 1 and 120),
 event_allowlist text[] not null default array['work.created','work.completed','work.status_changed','deliverable.published_to_client','review.changes_requested','automation.manual'],
 last_config_key uuid,
 status text not null default 'pending' check(status in ('pending','active','disabled')),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 create_key uuid not null,
 consented_by uuid not null references public.profiles(user_id) on delete restrict,
 consented_at timestamptz not null default now(),
 credentials_version integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 last_health_check timestamptz, last_health_status text check(last_health_status in ('delivered','failed')),
 unique(created_by,create_key), unique(id,project_id),
 check(cardinality(event_allowlist) between 1 and 6 and event_allowlist <@ array['work.created','work.completed','work.status_changed','deliverable.published_to_client','review.changes_requested','automation.manual'])
);
create index integration_connections_project_idx on public.integration_connections(project_id,created_at desc,id);
create table app_private.integration_credentials (
 connection_id uuid primary key references public.integration_connections(id) on delete restrict,
 -- URL is private too; credentials/query parameters are forbidden by the Edge validator.
 endpoint_url text not null, encrypted_secret jsonb not null,
 updated_at timestamptz not null default now()
);
alter table app_private.integration_credentials enable row level security;
alter table app_private.integration_credentials force row level security;

create table public.automation_definitions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 name text not null check(char_length(btrim(name)) between 1 and 120),
 enabled boolean not null default false,
 trigger_type text not null check(trigger_type in ('domain_event','manual')),
 event_type text check(event_type in ('work.created','work.completed','work.status_changed','deliverable.published_to_client','review.changes_requested')),
 conditions jsonb not null default '[]'::jsonb check(jsonb_typeof(conditions)='array'),
 actions jsonb not null check(jsonb_typeof(actions)='array' and jsonb_array_length(actions) between 1 and 5),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 create_key uuid not null, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(created_by,create_key),
 check((trigger_type='domain_event' and event_type is not null) or (trigger_type='manual' and event_type is null))
);
create index automation_definitions_scope_idx on public.automation_definitions(project_id,event_type) where enabled;
create index automation_definitions_history_idx on public.automation_definitions(project_id,created_at desc,id);
create table public.automation_runs (
 id uuid primary key default gen_random_uuid(),
 automation_id uuid not null references public.automation_definitions(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 owner_id uuid not null references public.profiles(user_id) on delete restrict,
 requested_by uuid references public.profiles(user_id) on delete restrict,
 event_id uuid references public.domain_events(event_id) on delete restrict,
 request_key uuid,
 revision integer not null, actions_snapshot jsonb not null,
 definition_snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','cancelled')),
 attempt integer not null default 0, max_attempt integer not null default 3,
 manual_retries integer not null default 0 check(manual_retries between 0 and 3),
 next_attempt_at timestamptz not null default now(),
 claim_token uuid, lease_until timestamptz,
 correlation_id uuid not null default gen_random_uuid(),
 causation_id uuid, depth integer not null default 0 check(depth between 0 and 3),
 started_at timestamptz, finished_at timestamptz,
 safe_error text, created_at timestamptz not null default now(),
 unique(automation_id,event_id), unique(requested_by,request_key),
 check(attempt between 0 and 12 and max_attempt between 3 and 12)
);
create index automation_runs_history_idx on public.automation_runs(automation_id,created_at desc,id);
create index automation_runs_scope_idx on public.automation_runs(project_id,created_at desc,id);
create index automation_runs_claim_idx on public.automation_runs(next_attempt_at,created_at) where status in ('pending','running');
create table public.automation_run_steps (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.automation_runs(id) on delete restrict,
 position integer not null check(position between 0 and 4), action jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','skipped')),
 attempt integer not null default 0,
 started_at timestamptz, finished_at timestamptz,
 safe_error text, result_resource_id uuid,
 attempts jsonb not null default '[]'::jsonb,
 unique(run_id,position)
);
create table public.webhook_deliveries (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.integration_connections(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 step_id uuid unique references public.automation_run_steps(id) on delete restrict,
 requested_by uuid references public.profiles(user_id) on delete restrict,
 request_key uuid, event_id uuid references public.domain_events(event_id) on delete restrict,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','attempting','delivered','failed')),
 attempt integer not null default 0, attempts jsonb not null default '[]'::jsonb,
 safe_error text, last_http_status integer,
 created_at timestamptz not null default now(), finished_at timestamptz,
 unique(requested_by,request_key)
);
create index webhook_deliveries_scope_idx on public.webhook_deliveries(project_id,created_at desc,id);
create index webhook_deliveries_connection_idx on public.webhook_deliveries(connection_id,created_at desc,id);

create table public.ai_project_consents (
 project_id uuid primary key references public.projects(id) on delete restrict,
 enabled boolean not null default false,
 consented_by uuid not null references public.profiles(user_id) on delete restrict,
 updated_at timestamptz not null default now()
);
create table public.ai_runs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 actor_id uuid not null references public.profiles(user_id) on delete restrict,
 request_key uuid not null,
 task_type text not null check(task_type in ('project_summary','draft_work')),
 provider text not null check(provider='local_deterministic'),
 model text not null check(model='omnia-local-v1'),
 template_key text not null, template_version integer not null check(template_version=1),
 status text not null default 'running' check(status in ('running','succeeded','failed')),
 result jsonb, safe_error text,
 context_counts jsonb not null,
 input_tokens integer check(input_tokens between 0 and 100000),
 output_tokens integer check(output_tokens between 0 and 4096),
 approved_work_item_id uuid references public.work_items(id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 started_at timestamptz not null default now(), finished_at timestamptz,
 unique(actor_id,request_key)
);
create index ai_runs_actor_idx on public.ai_runs(actor_id,started_at desc,id);
create index ai_runs_scope_idx on public.ai_runs(project_id,started_at desc,id);
-- Template instructions/output schemas live in the versioned server adapter.
-- Each run preserves the immutable template key/version and structured result.

alter table public.domain_events add column project_id uuid references public.projects(id) on delete restrict;
alter table public.domain_events add column origin_run_id uuid references public.automation_runs(id) on delete restrict;
alter table public.domain_events add column causation_id uuid;
alter table public.domain_events add column automation_depth integer not null default 0 check(automation_depth between 0 and 3);
create index domain_events_project_time_idx on public.domain_events(project_id,occurred_at desc);
create function app_private.p13_audit(p_type text,p_actor uuid,p_resource text,p_id uuid,p_project uuid,p_payload jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_agency uuid; v_org uuid;
begin
 select o.agency_id,o.id into v_agency,v_org from public.projects p join public.brands b on b.id=p.brand_id
 join public.organizations o on o.id=b.organization_id where p.id=p_project;
 return app_private.emit_event(p_type,p_actor,p_resource,p_id,v_agency,v_org,gen_random_uuid(),null,
  coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('project_id',p_project));
end; $$;
create function public.phase13_claim_run(p_run uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.automation_runs%rowtype; v_token uuid := gen_random_uuid();
begin
 -- Expired leases are recoverable; terminal attempts become visible dead letters.
 for v in update public.automation_runs set status='failed',safe_error='worker_timeout',finished_at=now(),claim_token=null,lease_until=null
  where status='running' and lease_until<now() and attempt>=max_attempt returning * loop
  update public.automation_run_steps set status='failed',safe_error='worker_timeout',finished_at=now(),
   attempts=attempts||jsonb_build_array(jsonb_build_object('attempt',v.attempt,'error','worker_timeout','at',now())) where run_id=v.id and status='running';
  perform app_private.p13_audit('automation.run.failed',v.owner_id,'automation_run',v.id,v.project_id,
   jsonb_build_object('automation_id',v.automation_id,'attempt',v.attempt,'safe_error','worker_timeout'));
 end loop;
 select * into v from public.automation_runs r
 where (p_run is null or r.id=p_run) and ((r.status='pending' and r.next_attempt_at<=now()) or (r.status='running' and r.lease_until<now()))
 order by r.next_attempt_at,r.created_at limit 1 for update skip locked;
 if v.id is null then return null; end if;
 if not app_private.p13_permission(v.project_id,v.owner_id,'automation.manage') or not exists(
  select 1 from public.automation_definitions a where a.id=v.automation_id and a.enabled) then
  update public.automation_runs set status='cancelled',finished_at=now(),safe_error='authorization_revoked',claim_token=null,lease_until=null where id=v.id;
  update public.automation_run_steps set status='skipped',safe_error='authorization_revoked' where run_id=v.id and status<>'succeeded';
  perform app_private.p13_audit('automation.run.cancelled',v.owner_id,'automation_run',v.id,v.project_id,jsonb_build_object('automation_id',v.automation_id));
  return jsonb_build_object('cancelled',v.id);
 end if;
 update public.automation_runs set status='running',claim_token=v_token,lease_until=now()+interval '60 seconds',
  attempt=attempt+1,started_at=coalesce(started_at,now()),finished_at=null where id=v.id;
 perform app_private.p13_audit('automation.run.started',v.owner_id,'automation_run',v.id,v.project_id,
  jsonb_build_object('automation_id',v.automation_id,'trigger_event_id',v.event_id,'attempt',v.attempt+1,'correlation_id',v.correlation_id));
 return jsonb_build_object('id',v.id,'token',v_token,'steps',jsonb_array_length(v.actions_snapshot));
end; $$;
create function app_private.p13_claimed_run(p_run uuid,p_token uuid)
returns public.automation_runs language plpgsql security definer set search_path='' as $$
declare v public.automation_runs%rowtype;
begin
 select * into v from public.automation_runs where id=p_run for update;
 if v.id is null or v.status<>'running' or v.claim_token is distinct from p_token or v.lease_until<=now() then
  raise exception using errcode='42501',message='stale_claim'; end if;
 if not app_private.p13_permission(v.project_id,v.owner_id,'automation.manage') or not exists(
  select 1 from public.automation_definitions a where a.id=v.automation_id and a.enabled) then
  raise exception using errcode='42501',message='authorization_revoked'; end if;
 return v;
end; $$;
create function public.phase13_prepare_step(p_run uuid,p_token uuid,p_position integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.automation_runs%rowtype; s public.automation_run_steps%rowtype; d public.webhook_deliveries%rowtype;
 v_work uuid; v_sub text; v_lineage text; e public.domain_events%rowtype;
begin
 v:=app_private.p13_claimed_run(p_run,p_token);
 select * into s from public.automation_run_steps where run_id=v.id and position=p_position for update;
 if s.id is null then raise exception using errcode='22023',message='invalid_step'; end if;
 if s.status='succeeded' then return jsonb_build_object('done',true); end if;
 if exists(select 1 from public.automation_run_steps where run_id=v.id and position<p_position and status<>'succeeded') then
  raise exception using errcode='22023',message='steps_out_of_order'; end if;
 perform app_private.p13_validate_definition(v.project_id,v.owner_id,'manual',null,'[]'::jsonb,jsonb_build_array(s.action));
 update public.automation_run_steps set status='running',started_at=coalesce(started_at,now()),attempt=attempt+1 where id=s.id;
 if s.action->>'type'='create_work_item' then
  -- Reuse the Phase 4 authoritative command with an explicitly scoped run-as owner.
  -- Settings are transaction-local, restored, and unreachable as a browser command.
  v_sub:=current_setting('request.jwt.claim.sub',true); v_lineage:=current_setting('omnia.automation_run',true);
  perform set_config('request.jwt.claim.sub',v.owner_id::text,true);
  perform set_config('omnia.automation_run',v.id::text,true);
  v_work:=app_private.create_work_item(v.project_id,s.action->>'title','Creado por automatización aprobada.',
   s.action->>'priority',null,null,'{}'::uuid[],s.id);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  perform set_config('omnia.automation_run',coalesce(v_lineage,''),true);
  update public.automation_run_steps set status='succeeded',finished_at=now(),safe_error=null,result_resource_id=v_work,
   attempts=attempts||jsonb_build_array(jsonb_build_object('attempt',attempt,'status','succeeded','at',now())) where id=s.id;
  return jsonb_build_object('done',true,'resource_id',v_work);
 end if;
 select * into e from public.domain_events where event_id=v.event_id;
 insert into public.webhook_deliveries(connection_id,project_id,step_id,event_id,payload)
 values((s.action->>'connection_id')::uuid,v.project_id,s.id,v.event_id,
  jsonb_build_object('version',1,'event_id',coalesce(v.event_id,v.id),'type',coalesce(e.event_type,'automation.manual'),
   'project_id',v.project_id,'resource',jsonb_build_object('type',coalesce(e.resource_type,'automation_run'),'id',coalesce(e.resource_id,v.id)),
   'correlation_id',v.correlation_id))
 on conflict(step_id) do nothing;
 select * into d from public.webhook_deliveries where step_id=s.id;
 if d.status='delivered' then
  update public.automation_run_steps set status='succeeded',finished_at=now(),result_resource_id=d.id where id=s.id;
  return jsonb_build_object('done',true);
 end if;
 update public.webhook_deliveries set status='attempting',attempt=attempt+1 where id=d.id;
 return jsonb_build_object('done',false,'delivery_id',d.id);
end; $$;
create function public.phase13_delivery_material(p_delivery uuid,p_run uuid default null,p_token uuid default null,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.webhook_deliveries%rowtype; c public.integration_connections%rowtype; m app_private.integration_credentials%rowtype;
 v_actor uuid; v_run public.automation_runs%rowtype;
begin
 select * into d from public.webhook_deliveries where id=p_delivery for update;
 if d.id is null or d.status<>'attempting' then raise exception using errcode='42501',message='delivery_forbidden'; end if;
 if d.step_id is not null then
  v_run:=app_private.p13_claimed_run(p_run,p_token);
  if not exists(select 1 from public.automation_run_steps s where s.id=d.step_id and s.run_id=v_run.id and s.status='running') then
   raise exception using errcode='42501',message='delivery_forbidden'; end if;
  v_actor:=v_run.owner_id;
 else
  if d.requested_by is distinct from p_actor then raise exception using errcode='42501',message='delivery_forbidden'; end if;
  v_actor:=p_actor;
 end if;
 select * into c from public.integration_connections where id=d.connection_id;
 select * into m from app_private.integration_credentials where connection_id=c.id;
 if c.status<>'active' or c.project_id is distinct from d.project_id or m.connection_id is null
  or (d.step_id is not null and not ((d.payload->>'type')=any(c.event_allowlist)))
  or not app_private.p13_permission(d.project_id,v_actor,case when d.step_id is null then 'integration.manage' else 'integration.view' end) then
  raise exception using errcode='42501',message='connection_scope_forbidden'; end if;
 return jsonb_build_object('url',m.endpoint_url,'cipher',m.encrypted_secret,'payload',d.payload,'delivery_id',d.id,'connection_id',c.id);
end; $$;
create function public.phase13_finish_delivery(p_delivery uuid,p_http_status integer,p_error text,
 p_run uuid default null,p_token uuid default null,p_actor uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare d public.webhook_deliveries%rowtype;
begin
 -- Rechecks scope/claim even after network I/O. Browser cannot call this RPC.
 perform public.phase13_delivery_material(p_delivery,p_run,p_token,p_actor);
 select * into d from public.webhook_deliveries where id=p_delivery for update;
 if p_error is not null and p_error not in ('network_timeout','provider_unavailable','rate_limited','invalid_credentials','configuration_missing','endpoint_forbidden','provider_rejected') then
  raise exception using errcode='22023',message='invalid_safe_error'; end if;
 update public.webhook_deliveries set status=case when p_error is null and p_http_status between 200 and 299 then 'delivered' else 'failed' end,
  last_http_status=p_http_status,safe_error=p_error,finished_at=now(),
  attempts=attempts||jsonb_build_array(jsonb_build_object('attempt',attempt,'status',p_http_status,'error',p_error,'at',now())) where id=d.id;
 if d.step_id is null then
  update public.integration_connections set last_health_check=now(),last_health_status=case when p_error is null and p_http_status between 200 and 299 then 'delivered' else 'failed' end where id=d.connection_id;
 end if;
end; $$;
create function public.phase13_finish_step(p_run uuid,p_token uuid,p_position integer,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.automation_runs%rowtype; s public.automation_run_steps%rowtype; v_retry boolean;
begin
 -- Completion must fence stale workers, including permission failures.
 select * into v from public.automation_runs where id=p_run for update;
 if v.id is null or v.status<>'running' or v.claim_token is distinct from p_token or v.lease_until<=now() then
  raise exception using errcode='42501',message='stale_claim'; end if;
 select * into s from public.automation_run_steps where run_id=v.id and position=p_position for update;
 if s.id is null then raise exception using errcode='22023',message='invalid_step'; end if;
 if s.status='succeeded' then return; end if;
 if p_error is null then
  perform app_private.p13_claimed_run(p_run,p_token);
  if not exists(select 1 from public.webhook_deliveries d where d.step_id=s.id and d.status='delivered') then
   raise exception using errcode='22023',message='step_not_completed'; end if;
 elsif p_error not in ('network_timeout','provider_unavailable','rate_limited','invalid_credentials','configuration_missing','endpoint_forbidden',
  'provider_rejected','authorization_revoked','invalid_configuration') then
  raise exception using errcode='22023',message='invalid_safe_error'; end if;
 update public.automation_run_steps set status=case when p_error is null then 'succeeded' else 'failed' end,
  safe_error=p_error,finished_at=now(),attempts=attempts||jsonb_build_array(jsonb_build_object('attempt',v.attempt,'error',p_error,'at',now())) where id=s.id;
 if p_error is not null then
  v_retry:=p_error in ('network_timeout','provider_unavailable','rate_limited') and v.attempt<v.max_attempt;
  update public.automation_runs set status=case when v_retry then 'pending' else 'failed' end,safe_error=p_error,
   next_attempt_at=now()+make_interval(secs=>least(300,5*power(2,v.attempt-1)::integer)),
   finished_at=case when v_retry then null else now() end,claim_token=null,lease_until=null where id=v.id;
  perform app_private.p13_audit('automation.run.failed',v.owner_id,'automation_run',v.id,v.project_id,
   jsonb_build_object('automation_id',v.automation_id,'attempt',v.attempt,'retry_scheduled',v_retry,'safe_error',p_error));
 end if;
end; $$;
create function public.phase13_finish_run(p_run uuid,p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.automation_runs%rowtype;
begin
 v:=app_private.p13_claimed_run(p_run,p_token);
 if exists(select 1 from public.automation_run_steps where run_id=v.id and status<>'succeeded') then
  raise exception using errcode='22023',message='run_not_completed'; end if;
 update public.automation_runs set status='succeeded',finished_at=now(),safe_error=null,claim_token=null,lease_until=null where id=v.id;
 perform app_private.p13_audit('automation.run.succeeded',v.owner_id,'automation_run',v.id,v.project_id,
  jsonb_build_object('automation_id',v.automation_id,'owner_id',v.owner_id,'trigger_event_id',v.event_id,'correlation_id',v.correlation_id));
end; $$;
create function public.phase13_test_connection(p_connection uuid,p_actor uuid,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.integration_connections%rowtype; d public.webhook_deliveries%rowtype; v_id uuid;
begin
 select * into c from public.integration_connections where id=p_connection for update;
 if c.id is null or c.status<>'active' or not app_private.p13_permission(c.project_id,p_actor,'integration.manage') then
  raise exception using errcode='42501',message='integration_forbidden'; end if;
 if p_key is null then raise exception using errcode='22023',message='invalid_test'; end if;
 perform pg_advisory_xact_lock(hashtextextended('p13.connection_test.'||p_actor::text,0));
 select * into d from public.webhook_deliveries where requested_by=p_actor and request_key=p_key;
 if d.id is not null then
  if d.connection_id<>c.id then raise exception using errcode='22023',message='idempotency_conflict'; end if;
  return jsonb_build_object('id',d.id,'replay',true,'status',d.status);
 end if;
 if (select count(*) from public.webhook_deliveries where requested_by=p_actor and created_at>now()-interval '1 minute')>=5 then
  raise exception using errcode='54000',message='rate_limited'; end if;
 v_id:=gen_random_uuid();
 insert into public.webhook_deliveries(id,connection_id,project_id,requested_by,request_key,payload,status,attempt)
 values(v_id,c.id,c.project_id,p_actor,p_key,jsonb_build_object('version',1,'event_id',v_id,'type','integration.test','project_id',c.project_id),'attempting',1);
 perform app_private.p13_audit('integration.connection.tested',p_actor,'integration_connection',c.id,c.project_id);
 return jsonb_build_object('id',v_id,'replay',false,'status','attempting');
end; $$;

create function public.phase13_ai_consent(p_project uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.p13_permission(p_project,(select auth.uid()),'ai.manage') then
  raise exception using errcode='42501',message='ai_forbidden'; end if;
 if p_enabled is null then raise exception using errcode='22023',message='invalid_consent'; end if;
 insert into public.ai_project_consents(project_id,enabled,consented_by) values(p_project,p_enabled,(select auth.uid()))
 on conflict(project_id) do update set enabled=excluded.enabled,consented_by=excluded.consented_by,updated_at=now();
 perform app_private.p13_audit('ai.consent.changed',(select auth.uid()),'project',p_project,p_project,jsonb_build_object('enabled',p_enabled));
end; $$;
create function public.phase13_start_ai(p_project uuid,p_actor uuid,p_task text,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.ai_runs%rowtype; v_context jsonb; v_name text; v_role text; v_counts jsonb;
begin
 if not app_private.p13_permission(p_project,p_actor,'ai.use') or not app_private.p13_permission(p_project,p_actor,'project.view') then
  raise exception using errcode='42501',message='ai_forbidden'; end if;
 if not exists(select 1 from public.ai_project_consents where project_id=p_project and enabled) then
  raise exception using errcode='42501',message='consent_required'; end if;
 if p_task is null or p_task not in ('project_summary','draft_work') or p_key is null then
  raise exception using errcode='22023',message='invalid_ai_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('p13.ai.'||p_actor::text,0));
 select * into v from public.ai_runs where actor_id=p_actor and request_key=p_key;
 if v.id is not null then
  if v.project_id<>p_project or v.task_type<>p_task then raise exception using errcode='22023',message='idempotency_conflict'; end if;
  return jsonb_build_object('id',v.id,'replay',true,'status',v.status);
 end if;
 update public.ai_runs set status='failed',safe_error='provider_unavailable',finished_at=now()
 where actor_id=p_actor and status='running' and started_at<now()-interval '60 seconds';
 if (select count(*) from public.ai_runs where actor_id=p_actor and started_at>now()-interval '1 minute')>=10 then
  raise exception using errcode='54000',message='rate_limited'; end if;
 if (select count(*) from public.ai_runs where actor_id=p_actor and status='running')>=2 then
  raise exception using errcode='54000',message='concurrency_limited'; end if;
 select p.name,am.role_key into v_name,v_role from public.projects p join public.brands b on b.id=p.brand_id
 join public.organizations o on o.id=b.organization_id join public.agency_memberships am on am.agency_id=o.agency_id
 where p.id=p_project and am.user_id=p_actor and am.status='active';
 with visible as materialized (select w.id,left(w.title,160) as title,w.status from public.work_items w
  where w.project_id=p_project and w.archived_at is null and app_private.p13_permission(p_project,p_actor,'work.view')
   and (v_role in ('agency_director','project_manager') or exists(select 1 from public.work_item_assignees a
    where a.work_item_id=w.id and a.user_id=p_actor and a.revoked_at is null))),
 bounded as (select * from visible order by id limit 20)
 select jsonb_build_object('project_name',left(v_name,120),'open_work',(select count(*) from visible where status not in ('done','cancelled')),
  'completed_work',(select count(*) from visible where status='done'),'work_titles',coalesce(jsonb_agg(title),'[]'::jsonb)) into v_context from bounded;
 v_counts:=jsonb_build_object('work_items',jsonb_array_length(v_context->'work_titles'));
 insert into public.ai_runs(project_id,actor_id,request_key,task_type,provider,model,template_key,template_version,context_counts)
 values(p_project,p_actor,p_key,p_task,'local_deterministic','omnia-local-v1',p_task,1,v_counts) returning * into v;
 return jsonb_build_object('id',v.id,'replay',false,'context',v_context,'template_version',1);
end; $$;
create function public.phase13_complete_ai(p_run uuid,p_actor uuid,p_result jsonb,p_error text default null,p_input_tokens integer default null,p_output_tokens integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.ai_runs%rowtype;
begin
 select * into v from public.ai_runs where id=p_run for update;
 if v.id is null or v.actor_id is distinct from p_actor then raise exception using errcode='42501',message='ai_forbidden'; end if;
 if v.status<>'running' then return; end if;
 if not app_private.p13_permission(v.project_id,p_actor,'ai.use') or not exists(
  select 1 from public.ai_project_consents where project_id=v.project_id and enabled) then
  p_error:='unauthorized'; p_result:=null;
 end if;
 if p_error is not null and p_error not in ('provider_unavailable','rate_limited','invalid_result','unauthorized','configuration_missing') then
  raise exception using errcode='22023',message='invalid_safe_error'; end if;
 if p_error is null then
  if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>8192 then p_error:='invalid_result';
  elsif v.task_type='project_summary' then
   if (p_result-'summary'-'open_work'-'completed_work')<>'{}'::jsonb or jsonb_typeof(p_result->'summary') is distinct from 'string'
    or char_length(p_result->>'summary') not between 1 and 2000
    or coalesce(p_result->>'open_work','') !~ '^[0-9]{1,8}$' or jsonb_typeof(p_result->'open_work') is distinct from 'number'
    or coalesce(p_result->>'completed_work','') !~ '^[0-9]{1,8}$' or jsonb_typeof(p_result->'completed_work') is distinct from 'number' then p_error:='invalid_result'; end if;
  elsif (p_result-'title'-'description'-'priority')<>'{}'::jsonb or jsonb_typeof(p_result->'title') is distinct from 'string'
   or char_length(btrim(p_result->>'title')) not between 1 and 160 or jsonb_typeof(p_result->'description') is distinct from 'string'
   or char_length(p_result->>'description')>2000 or coalesce(p_result->>'priority','') not in ('low','normal','high','urgent') then p_error:='invalid_result'; end if;
 end if;
 update public.ai_runs set status=case when p_error is null then 'succeeded' else 'failed' end,
  result=case when p_error is null then p_result else null end,safe_error=p_error,finished_at=now(),
  input_tokens=p_input_tokens,output_tokens=p_output_tokens where id=v.id;
 perform app_private.p13_audit(case when p_error is null then 'ai.run.completed' else 'ai.run.failed' end,
  p_actor,'ai_run',v.id,v.project_id,jsonb_build_object('task',v.task_type,'template_version',v.template_version,'safe_error',p_error));
end; $$;
create function public.phase13_approve_ai_draft(p_run uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.ai_runs%rowtype; v_work uuid;
begin
 select * into v from public.ai_runs where id=p_run for update;
 if v.id is null or v.actor_id is distinct from (select auth.uid()) or not app_private.p13_permission(v.project_id,(select auth.uid()),'ai.use')
  or not app_private.p13_permission(v.project_id,(select auth.uid()),'work.create')
  or not exists(select 1 from public.ai_project_consents where project_id=v.project_id and enabled) then
  raise exception using errcode='42501',message='ai_approval_forbidden'; end if;
 if v.approved_work_item_id is not null then return v.approved_work_item_id; end if;
 if v.status<>'succeeded' or v.task_type<>'draft_work' then raise exception using errcode='22023',message='invalid_ai_draft'; end if;
 v_work:=app_private.create_work_item(v.project_id,v.result->>'title',v.result->>'description',v.result->>'priority',null,null,'{}'::uuid[],v.id);
 update public.ai_runs set approved_work_item_id=v_work where id=v.id;
 perform app_private.p13_audit('ai.action.approved',(select auth.uid()),'ai_run',v.id,v.project_id,jsonb_build_object('work_item_id',v_work));
 return v_work;
end; $$;

-- Safe read models exclude queue tokens, credentials, and arbitrary provider input.
create function public.phase13_history(p_project uuid,p_kind text,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_cap text; v_items jsonb; v_total bigint;
begin
 v_cap:=case p_kind when 'automations' then 'automation.view' when 'runs' then 'automation.view'
  when 'connections' then 'integration.view' when 'deliveries' then 'integration.view' when 'ai' then 'ai.use' end;
 if v_cap is null or not app_private.p13_permission(p_project,(select auth.uid()),v_cap) then
  raise exception using errcode='42501',message='history_forbidden'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 100000 then
  raise exception using errcode='22023',message='invalid_page'; end if;
 if p_kind='automations' then
  select count(*) into v_total from public.automation_definitions where project_id=p_project;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_items from (select id,name,enabled,trigger_type,event_type,conditions,actions,revision,created_by,created_at
   from public.automation_definitions where project_id=p_project order by created_at desc,id desc limit p_limit offset p_offset) r;
 elsif p_kind='runs' then
  select count(*) into v_total from public.automation_runs where project_id=p_project;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_items from (select id,automation_id,owner_id,event_id,status,attempt,max_attempt,manual_retries,
   correlation_id,causation_id,depth,started_at,finished_at,safe_error,created_at,next_attempt_at,revision
   from public.automation_runs where project_id=p_project order by created_at desc,id desc limit p_limit offset p_offset) r;
 elsif p_kind='connections' then
  select count(*) into v_total from public.integration_connections where project_id=p_project;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_items from (select id,provider,display_name,event_allowlist,status,credentials_version,consented_at,created_at,last_health_check,last_health_status
   from public.integration_connections where project_id=p_project order by created_at desc,id desc limit p_limit offset p_offset) r;
 elsif p_kind='deliveries' then
  select count(*) into v_total from public.webhook_deliveries where project_id=p_project;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_items from (select id,connection_id,step_id,event_id,status,attempt,safe_error,last_http_status,created_at,finished_at,attempts
   from public.webhook_deliveries where project_id=p_project order by created_at desc,id desc limit p_limit offset p_offset) r;
 else
  select count(*) into v_total from public.ai_runs where project_id=p_project and actor_id=(select auth.uid());
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_items from (select id,task_type,provider,model,template_key,template_version,status,result,safe_error,
   context_counts,input_tokens,output_tokens,approved_work_item_id,started_at,finished_at
   from public.ai_runs where project_id=p_project and actor_id=(select auth.uid()) order by started_at desc,id desc limit p_limit offset p_offset) r;
 end if;
 return jsonb_build_object('items',v_items,'total',v_total);
end; $$;
create function public.phase13_run_detail(p_run uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.automation_runs%rowtype; v_steps jsonb;
begin
 select * into v from public.automation_runs where id=p_run;
 if v.id is null or not app_private.p13_permission(v.project_id,(select auth.uid()),'automation.view') then
  raise exception using errcode='42501',message='history_forbidden'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'position',s.position,'action',s.action->>'type','status',s.status,
  'attempt',s.attempt,'started_at',s.started_at,'finished_at',s.finished_at,'safe_error',s.safe_error,
  'result_resource_id',s.result_resource_id,'attempts',s.attempts) order by s.position),'[]') into v_steps
 from public.automation_run_steps s where s.run_id=v.id;
 return jsonb_build_object('id',v.id,'steps',v_steps);
end; $$;

-- Public metadata is read-only under RLS; every mutation is an authoritative command.
alter table public.integration_connections enable row level security;
alter table public.integration_connections force row level security;
alter table public.automation_definitions enable row level security;
alter table public.automation_definitions force row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_runs force row level security;
alter table public.automation_run_steps enable row level security;
alter table public.automation_run_steps force row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_deliveries force row level security;
alter table public.ai_project_consents enable row level security;
alter table public.ai_project_consents force row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_runs force row level security;
create policy integration_connections_read on public.integration_connections for select to authenticated using(public.phase13_access(project_id,'integration.view'));
create policy automation_definitions_read on public.automation_definitions for select to authenticated using(public.phase13_access(project_id,'automation.view'));
create policy automation_runs_read on public.automation_runs for select to authenticated using(public.phase13_access(project_id,'automation.view'));
create policy automation_run_steps_read on public.automation_run_steps for select to authenticated using(exists(select 1 from public.automation_runs r where r.id=run_id));
create policy webhook_deliveries_read on public.webhook_deliveries for select to authenticated using(public.phase13_access(project_id,'integration.view'));
create policy ai_project_consents_read on public.ai_project_consents for select to authenticated using(public.phase13_access(project_id,'ai.use'));
create policy ai_runs_read on public.ai_runs for select to authenticated using(actor_id=(select auth.uid()) and public.phase13_access(project_id,'ai.use'));
revoke all on public.integration_connections,public.automation_definitions,public.automation_runs,public.automation_run_steps,
 public.webhook_deliveries,public.ai_project_consents,public.ai_runs,app_private.integration_credentials from public,anon,authenticated,service_role;
grant select on public.integration_connections,public.automation_definitions,public.ai_project_consents,public.ai_runs to authenticated;
grant select(id,automation_id,project_id,owner_id,requested_by,event_id,revision,status,attempt,max_attempt,manual_retries,
 next_attempt_at,correlation_id,causation_id,depth,started_at,finished_at,safe_error,created_at) on public.automation_runs to authenticated;
grant select on public.automation_run_steps to authenticated;
grant select(id,connection_id,project_id,step_id,event_id,status,attempt,attempts,safe_error,last_http_status,created_at,finished_at) on public.webhook_deliveries to authenticated;
create function public.phase13_projects(p_capability text)
returns table(id uuid,name text,organization_id uuid,organization_name text,can_manage boolean,can_run boolean)
language sql stable security definer set search_path='' as $$
 select p.id,p.name,o.id,o.name,
 app_private.p13_permission(p.id,(select auth.uid()),case when $1 like 'integration.%' then 'integration.manage' when $1 like 'ai.%' then 'ai.manage' else 'automation.manage' end),
 app_private.p13_permission(p.id,(select auth.uid()),case when $1 like 'integration.%' then 'integration.manage' when $1 like 'ai.%' then 'ai.use' else 'automation.run' end)
 from public.projects p join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id
 where $1 in ('automation.view','integration.view','ai.use') and app_private.p13_permission(p.id,(select auth.uid()),$1)
 order by p.name,p.id limit 100;
$$;

create function public.phase13_save_connection(p_project uuid,p_name text,p_key uuid,p_id uuid default null,
 p_events text[] default array['work.created','work.completed','work.status_changed','deliverable.published_to_client','review.changes_requested','automation.manual'])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid := (select auth.uid());
begin
 if not app_private.p13_permission(p_project,v_actor,'integration.manage') then
  raise exception using errcode='42501',message='integration_forbidden'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_key is null or p_events is null
  or cardinality(p_events) not between 1 and 6 or not(p_events <@ array['work.created','work.completed','work.status_changed','deliverable.published_to_client','review.changes_requested','automation.manual']) then
  raise exception using errcode='22023',message='invalid_connection'; end if;
 if p_id is not null then
  select id into v_id from public.integration_connections where id=p_id and project_id=p_project for update;
  if v_id is null then raise exception using errcode='42501',message='integration_forbidden'; end if;
  update public.integration_connections set display_name=btrim(p_name),event_allowlist=p_events,updated_at=now() where id=v_id;
 else
  insert into public.integration_connections(project_id,display_name,event_allowlist,created_by,create_key,consented_by)
  values(p_project,btrim(p_name),p_events,v_actor,p_key,v_actor)
  on conflict(created_by,create_key) do nothing returning id into v_id;
  if v_id is null then
   select id into v_id from public.integration_connections where created_by=v_actor and create_key=p_key and project_id=p_project;
   if v_id is null then raise exception using errcode='22023',message='idempotency_conflict'; end if;
  else
   perform app_private.p13_audit('integration.connection.created',v_actor,'integration_connection',v_id,p_project);
  end if;
 end if;
 return v_id;
end; $$;
-- Callable only by the Edge infrastructure after getUser(). No plaintext enters SQL.
create function public.phase13_store_credentials(p_connection uuid,p_actor uuid,p_url text,p_cipher jsonb,p_key uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.integration_connections%rowtype;
begin
 select * into v from public.integration_connections where id=p_connection for update;
 if v.id is null or not app_private.p13_permission(v.project_id,p_actor,'integration.manage') then
  raise exception using errcode='42501',message='integration_forbidden'; end if;
 if p_key is null then raise exception using errcode='22023',message='invalid_connection'; end if;
 if v.last_config_key=p_key then return; end if;
 if p_url is null or char_length(p_url)>2048 or p_cipher is null or jsonb_typeof(p_cipher)<>'object'
  or p_cipher->>'algorithm' is distinct from 'AES-GCM' or p_cipher->>'key_version' is distinct from '1'
  or not(p_cipher ?& array['iv','ciphertext']) then
  raise exception using errcode='22023',message='invalid_credentials_envelope'; end if;
 insert into app_private.integration_credentials(connection_id,endpoint_url,encrypted_secret) values(v.id,p_url,p_cipher)
 on conflict(connection_id) do update set endpoint_url=excluded.endpoint_url,encrypted_secret=excluded.encrypted_secret,updated_at=now();
 update public.integration_connections set status='active',credentials_version=credentials_version+1,
  consented_by=p_actor,consented_at=now(),updated_at=now(),last_config_key=p_key where id=v.id;
 perform app_private.p13_audit('integration.secret.changed',p_actor,'integration_connection',v.id,v.project_id,
  jsonb_build_object('credentials_version',v.credentials_version+1));
end; $$;
create function public.phase13_disable_connection(p_connection uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.integration_connections%rowtype;
begin
 select * into v from public.integration_connections where id=p_connection for update;
 if v.id is null or not app_private.p13_permission(v.project_id,(select auth.uid()),'integration.manage') then
  raise exception using errcode='42501',message='integration_forbidden'; end if;
 update public.integration_connections set status='disabled',updated_at=now() where id=v.id;
 perform app_private.p13_audit('integration.connection.disabled',(select auth.uid()),'integration_connection',v.id,v.project_id);
end; $$;

create function app_private.p13_validate_definition(p_project uuid,p_actor uuid,p_trigger text,p_event text,p_conditions jsonb,p_actions jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v jsonb; v_connection uuid;
begin
 if p_trigger is null or p_trigger not in ('manual','domain_event')
  or (p_trigger='domain_event' and (p_event is null or p_event not in ('work.created','work.completed','work.status_changed','deliverable.published_to_client','review.changes_requested')))
  or (p_trigger='manual' and p_event is not null)
  or p_conditions is null or jsonb_typeof(p_conditions)<>'array' or jsonb_array_length(p_conditions)>5
  or p_actions is null or jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions) not between 1 and 5 then
  raise exception using errcode='22023',message='invalid_automation'; end if;
 for v in select value from jsonb_array_elements(p_conditions) loop
  if jsonb_typeof(v)<>'object' or (v-'field'-'operator'-'value')<>'{}'::jsonb
   or coalesce(v->>'field','') not in ('event_type','project_id','resource_type','status')
   or coalesce(v->>'operator','') not in ('equals','exists','contains')
   or (v->>'operator'<>'exists' and (jsonb_typeof(v->'value') is distinct from 'string' or char_length(v->>'value')>120)) then
   raise exception using errcode='22023',message='invalid_condition'; end if;
 end loop;
 for v in select value from jsonb_array_elements(p_actions) loop
  if jsonb_typeof(v)<>'object' then raise exception using errcode='22023',message='invalid_action'; end if;
  if v->>'type'='create_work_item' then
   if (v-'type'-'title'-'priority')<>'{}'::jsonb or jsonb_typeof(v->'title') is distinct from 'string'
    or char_length(btrim(v->>'title')) not between 1 and 160 or coalesce(v->>'priority','') not in ('low','normal','high','urgent')
    or not app_private.p13_permission(p_project,p_actor,'work.create') then
    raise exception using errcode='22023',message='invalid_work_action'; end if;
  elsif v->>'type'='outbound_webhook' then
   if (v-'type'-'connection_id')<>'{}'::jsonb or coalesce(v->>'connection_id','') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception using errcode='22023',message='invalid_webhook_action'; end if;
   v_connection := (v->>'connection_id')::uuid;
   if not app_private.p13_permission(p_project,p_actor,'integration.view') or not exists(
    select 1 from public.integration_connections c where c.id=v_connection and c.project_id=p_project and c.status='active') then
    raise exception using errcode='42501',message='connection_scope_forbidden'; end if;
  else raise exception using errcode='22023',message='action_not_allowlisted'; end if;
 end loop;
end; $$;
create function public.phase13_save_automation(p_project uuid,p_name text,p_enabled boolean,p_trigger text,p_event text,
 p_conditions jsonb,p_actions jsonb,p_key uuid,p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid := (select auth.uid()); v_owner uuid;
begin
 if not app_private.p13_permission(p_project,v_actor,'automation.manage') then
  raise exception using errcode='42501',message='automation_forbidden'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_enabled is null or p_key is null then
  raise exception using errcode='22023',message='invalid_automation'; end if;
 v_owner := v_actor;
 if p_id is not null then
  select id,created_by into v_id,v_owner from public.automation_definitions where id=p_id and project_id=p_project for update;
  if v_id is null then raise exception using errcode='42501',message='automation_forbidden'; end if;
 end if;
 perform app_private.p13_validate_definition(p_project,v_owner,p_trigger,p_event,p_conditions,p_actions);
 if p_id is null then
  insert into public.automation_definitions(project_id,name,enabled,trigger_type,event_type,conditions,actions,created_by,create_key)
  values(p_project,btrim(p_name),p_enabled,p_trigger,p_event,p_conditions,p_actions,v_actor,p_key)
  on conflict(created_by,create_key) do nothing returning id into v_id;
  if v_id is null then
   select id into v_id from public.automation_definitions where created_by=v_actor and create_key=p_key and project_id=p_project;
   if v_id is null then raise exception using errcode='22023',message='idempotency_conflict'; end if;
   return v_id;
  end if;
 else
  update public.automation_definitions set name=btrim(p_name),enabled=p_enabled,trigger_type=p_trigger,event_type=p_event,
   conditions=p_conditions,actions=p_actions,revision=revision+1,updated_at=now() where id=v_id;
 end if;
 perform app_private.p13_audit(case when p_enabled then 'automation.enabled' else 'automation.disabled' end,
  v_actor,'automation',v_id,p_project,jsonb_build_object('owner_id',v_owner));
 return v_id;
end; $$;

-- Execution lineage is attached inside the same transaction as the existing command.
create function app_private.p13_event_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_origin text := nullif(current_setting('omnia.automation_run',true),''); v_run public.automation_runs%rowtype;
begin
 if new.resource_type='work_item' then select project_id into new.project_id from public.work_items where id=new.resource_id;
 elsif new.resource_type='project' then new.project_id:=new.resource_id;
 elsif new.resource_type='deliverable' then select project_id into new.project_id from public.deliverables where id=new.resource_id;
 elsif new.resource_type='review_round' then
  select d.project_id into new.project_id from public.review_rounds r join public.deliverable_versions v on v.id=r.deliverable_version_id
  join public.deliverables d on d.id=v.deliverable_id where r.id=new.resource_id;
 elsif new.payload->>'project_id' ~ '^[0-9a-fA-F-]{36}$' then new.project_id:=(new.payload->>'project_id')::uuid;
 end if;
 if v_origin is not null then
  select * into v_run from public.automation_runs where id=v_origin::uuid and status='running';
  if v_run.id is null or v_run.project_id is distinct from new.project_id then
   raise exception using errcode='42501',message='automation_event_scope_forbidden'; end if;
  new.origin_run_id:=v_run.id; new.causation_id:=coalesce(v_run.event_id,v_run.id); new.correlation_id:=v_run.correlation_id;
  new.automation_depth:=v_run.depth+1;
  new.payload:=new.payload||jsonb_build_object('origin_run_id',v_run.id,'automation_id',v_run.automation_id,
   'configuration_owner',v_run.owner_id,'automation_depth',new.automation_depth);
 end if;
 return new;
end; $$;
create trigger phase13_event_context before insert on public.domain_events for each row execute function app_private.p13_event_context();
create function app_private.p13_conditions(p_conditions jsonb,p_event public.domain_events)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare v jsonb; v_value text;
begin
 for v in select value from jsonb_array_elements(p_conditions) loop
  v_value:=case v->>'field' when 'event_type' then p_event.event_type when 'project_id' then p_event.project_id::text
   when 'resource_type' then p_event.resource_type when 'status' then p_event.payload->>'to' end;
  if v->>'operator'='exists' and v_value is null then return false;
  elsif v->>'operator'='equals' and v_value is distinct from v->>'value' then return false;
  elsif v->>'operator'='contains' and (v_value is null or position((v->>'value') in v_value)=0) then return false;
  end if;
 end loop;
 return true;
end; $$;
create function app_private.p13_enqueue(p_definition public.automation_definitions,p_event public.domain_events,p_actor uuid,p_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 insert into public.automation_runs(automation_id,project_id,owner_id,requested_by,event_id,request_key,revision,actions_snapshot,definition_snapshot,
  correlation_id,causation_id,depth)
 values(p_definition.id,p_definition.project_id,p_definition.created_by,p_actor,p_event.event_id,p_key,p_definition.revision,p_definition.actions,
  jsonb_build_object('name',p_definition.name,'trigger',p_definition.trigger_type,'event_type',p_definition.event_type,'conditions',p_definition.conditions),
  coalesce(p_event.correlation_id,gen_random_uuid()),p_event.origin_run_id,coalesce(p_event.automation_depth,0))
 on conflict do nothing returning id into v_id;
 if v_id is not null then
  insert into public.automation_run_steps(run_id,position,action)
   select v_id,(ordinality-1)::integer,value from jsonb_array_elements(p_definition.actions) with ordinality;
 end if;
 return v_id;
end; $$;
create function app_private.p13_dispatch_event(p_event public.domain_events)
returns integer language plpgsql security definer set search_path='' as $$
declare v public.automation_definitions%rowtype; v_count integer:=0;
begin
 if p_event.project_id is null or p_event.automation_depth>=3 then return 0; end if;
 for v in select * from public.automation_definitions a where a.enabled and a.project_id=p_event.project_id
  -- Replaying an old event must not apply a definition enabled/revised afterwards.
  and a.trigger_type='domain_event' and a.event_type=p_event.event_type and a.updated_at<=p_event.occurred_at loop
  if app_private.p13_permission(v.project_id,v.created_by,'automation.manage')
   and app_private.p13_conditions(v.conditions,p_event)
   and not exists(select 1 from public.automation_runs r where r.id=p_event.origin_run_id and r.automation_id=v.id) then
   if app_private.p13_enqueue(v,p_event,null,null) is not null then v_count:=v_count+1; end if;
  end if;
 end loop;
 return v_count;
end; $$;
create function app_private.p13_event_dispatch_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform app_private.p13_dispatch_event(new); return new; end; $$;
create trigger phase13_dispatch_event after insert on public.domain_events for each row execute function app_private.p13_event_dispatch_trigger();
create function public.phase13_replay_event(p_event uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v public.domain_events%rowtype;
begin select * into v from public.domain_events where event_id=p_event;
 if v.event_id is null then return 0; end if;
 return app_private.p13_dispatch_event(v); end; $$;
create function public.phase13_manual_run(p_automation uuid,p_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.automation_definitions%rowtype; v_id uuid; v_event public.domain_events%rowtype;
begin
 select * into v from public.automation_definitions where id=p_automation for share;
 if v.id is null or not app_private.p13_permission(v.project_id,(select auth.uid()),'automation.run') then
  raise exception using errcode='42501',message='automation_forbidden'; end if;
 if p_key is null then raise exception using errcode='22023',message='invalid_run'; end if;
 select id into v_id from public.automation_runs where requested_by=(select auth.uid()) and request_key=p_key and automation_id=v.id;
 if v_id is not null then return v_id; end if;
 if not v.enabled then raise exception using errcode='22023',message='automation_disabled'; end if;
 perform pg_advisory_xact_lock(hashtextextended('p13.manual.'||(select auth.uid())::text,0));
 select id into v_id from public.automation_runs where requested_by=(select auth.uid()) and request_key=p_key and automation_id=v.id;
 if v_id is not null then return v_id; end if;
 if (select count(*) from public.automation_runs where requested_by=(select auth.uid()) and created_at>now()-interval '1 minute')>=10 then
  raise exception using errcode='54000',message='rate_limited'; end if;
 -- Manual invocation can also test an event definition, with no fabricated event payload.
 v_id:=app_private.p13_enqueue(v,v_event,(select auth.uid()),p_key);
 if v_id is null then raise exception using errcode='22023',message='idempotency_conflict'; end if;
 perform app_private.p13_audit('automation.manually_run',(select auth.uid()),'automation_run',v_id,v.project_id,
  jsonb_build_object('automation_id',v.id,'owner_id',v.created_by));
 return v_id;
end; $$;
create function public.phase13_retry_run(p_run uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.automation_runs%rowtype;
begin
 select * into v from public.automation_runs where id=p_run for update;
 if v.id is null or not app_private.p13_permission(v.project_id,(select auth.uid()),'automation.run') then
  raise exception using errcode='42501',message='automation_forbidden'; end if;
 if v.status<>'failed' or v.manual_retries>=3 or not exists(select 1 from public.automation_definitions a where a.id=v.automation_id and a.enabled) then
  raise exception using errcode='22023',message='retry_not_allowed'; end if;
 perform pg_advisory_xact_lock(hashtextextended('p13.retry.'||(select auth.uid())::text,0));
 if (select count(*) from public.audit_events where actor_id=(select auth.uid()) and event_type='automation.retried' and occurred_at>now()-interval '1 minute')>=10 then
  raise exception using errcode='54000',message='rate_limited'; end if;
 update public.automation_runs set status='pending',max_attempt=attempt+3,manual_retries=manual_retries+1,
  next_attempt_at=now(),finished_at=null,claim_token=null,lease_until=null where id=v.id;
 update public.automation_run_steps set status='pending' where run_id=v.id and status in ('failed','running');
 perform app_private.p13_audit('automation.retried',(select auth.uid()),'automation_run',v.id,v.project_id,
  jsonb_build_object('automation_id',v.automation_id,'next_attempt',v.attempt+1));
end; $$;

do $$ declare v record; begin
 for v in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='app_private' and p.proname like 'p13_%') or (n.nspname='public' and p.proname like 'phase13_%') loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',v.nspname,v.proname,v.arguments);
  if v.nspname='public' then
   if v.proname in ('phase13_claim_run','phase13_prepare_step','phase13_delivery_material','phase13_finish_delivery','phase13_finish_step',
    'phase13_finish_run','phase13_replay_event','phase13_store_credentials','phase13_test_connection','phase13_start_ai','phase13_complete_ai') then
    execute format('grant execute on function %I.%I(%s) to service_role',v.nspname,v.proname,v.arguments);
   else execute format('grant execute on function %I.%I(%s) to authenticated',v.nspname,v.proname,v.arguments); end if;
  end if;
 end loop;
end; $$;
