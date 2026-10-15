begin;

create sequence public.user_draft_revision_seq;
revoke all on sequence public.user_draft_revision_seq from public,anon,authenticated;
grant usage,select on sequence public.user_draft_revision_seq to service_role;

create table public.user_drafts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('work', 'editorial', 'automation', 'message', 'project')),
  scope_id uuid not null,
  draft_key text not null check (char_length(draft_key) between 1 and 120),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 65536),
  revision bigint not null default nextval('public.user_draft_revision_seq') check (revision > 0),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key (owner_id, kind, scope_id, draft_key)
);
create index user_drafts_expiration_idx on public.user_drafts(expires_at);
alter table public.user_drafts enable row level security;
revoke all on public.user_drafts from public, anon, authenticated;
grant select on public.user_drafts to authenticated;
grant all on public.user_drafts to service_role;

create function app_private.draft_scope_allowed(kind text, scope_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and case kind
    when 'work' then app_private.project_permission(scope_id, 'work.create')
    when 'editorial' then app_private.project_permission(scope_id, 'editorial.plan') or app_private.project_permission(scope_id, 'editorial.create') or app_private.project_permission(scope_id, 'editorial.update')
    when 'automation' then app_private.p13_permission(scope_id, auth.uid(), 'automation.manage')
    when 'message' then app_private.channel_access(scope_id, auth.uid())
    when 'project' then exists (select 1 from public.organizations o where o.agency_id=scope_id and public.has_capability('project.create',o.agency_id,o.id))
    else false end
$$;
revoke all on function app_private.draft_scope_allowed(text,uuid) from public, anon;
grant execute on function app_private.draft_scope_allowed(text,uuid) to authenticated, service_role;

create function app_private.draft_body_allowed(kind text, scope_id uuid, body jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select kind<>'project' or body='{}'::jsonb or exists(
    select 1 from public.brands b join public.organizations o on o.id=b.organization_id
    where b.id::text=body->>'brandId' and o.agency_id=scope_id and public.has_capability('project.create',o.agency_id,o.id)
  )
$$;
revoke all on function app_private.draft_body_allowed(text,uuid,jsonb) from public,anon;
grant execute on function app_private.draft_body_allowed(text,uuid,jsonb) to authenticated,service_role;

create policy user_drafts_owner_read on public.user_drafts for select to authenticated
using (owner_id = (select auth.uid()) and expires_at > now() and app_private.draft_scope_allowed(kind, scope_id) and app_private.draft_body_allowed(kind,scope_id,body));

create function public.save_user_draft(p_owner uuid, p_kind text, p_scope uuid, p_key text, p_body jsonb, p_revision bigint)
returns public.user_drafts language plpgsql security definer set search_path = '' as $$
declare current_draft public.user_drafts; saved public.user_drafts;
begin
  if p_owner is distinct from auth.uid() or not app_private.draft_scope_allowed(p_kind,p_scope) or not app_private.draft_body_allowed(p_kind,p_scope,p_body) then
    raise exception using errcode='42501',message='draft_scope_denied';
  end if;
  if p_body::text ~* '"[^" ]*(password|secret|token|api.?key|credential)[^" ]*"\s*:' then
    raise exception using errcode='22023',message='draft_secret_field_forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_kind||p_scope::text||p_key,0));
  select * into current_draft from public.user_drafts
    where owner_id=p_owner and kind=p_kind and scope_id=p_scope and draft_key=p_key;
  if current_draft.expires_at<=now() and p_revision=0 then
    delete from public.user_drafts where owner_id=p_owner and kind=p_kind and scope_id=p_scope and draft_key=p_key;
    current_draft:=null;
  elsif current_draft.expires_at<=now() then
    raise exception using errcode='40001',message='draft_revision_conflict';
  end if;
  if coalesce(current_draft.revision,0) <> p_revision then
    raise exception using errcode='40001',message='draft_revision_conflict';
  end if;
  insert into public.user_drafts(owner_id,kind,scope_id,draft_key,body,revision)
    values(p_owner,p_kind,p_scope,p_key,p_body,nextval('public.user_draft_revision_seq'))
    on conflict (owner_id,kind,scope_id,draft_key) do update
    set body=excluded.body,revision=excluded.revision,updated_at=now(),expires_at=now()+interval '30 days'
    returning * into saved;
  return saved;
end $$;

-- A tombstone advances the version so an older browser tab cannot resurrect submitted content.
create function public.clear_user_draft(p_owner uuid,p_kind text,p_scope uuid,p_key text,p_revision bigint)
returns public.user_drafts language sql security invoker set search_path = '' as $$
  select public.save_user_draft(p_owner,p_kind,p_scope,p_key,'{}'::jsonb,p_revision)
$$;
revoke all on function public.save_user_draft(uuid,text,uuid,text,jsonb,bigint) from public,anon;
revoke all on function public.clear_user_draft(uuid,text,uuid,text,bigint) from public,anon;
grant execute on function public.save_user_draft(uuid,text,uuid,text,jsonb,bigint),public.clear_user_draft(uuid,text,uuid,text,bigint) to authenticated;

create function app_private.cleanup_expired_drafts()
returns bigint language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from public.user_drafts where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function app_private.cleanup_expired_drafts() from public,anon,authenticated;
grant execute on function app_private.cleanup_expired_drafts() to service_role;
-- pg_cron can be installed only in its configured database, not in isolated test clones.
do $$ begin
  if current_database() = current_setting('cron.database_name',true) then
    create extension if not exists pg_cron;
    perform cron.schedule('omnia-private-draft-cleanup','19 3 * * *','select app_private.cleanup_expired_drafts()');
  end if;
end $$;

commit;
