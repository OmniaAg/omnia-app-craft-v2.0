begin;

insert into public.roles(key, context, display_name, description)
values ('developer', 'agency', 'Developer', 'Same operational authority and scope as Agency Director; independently identified in memberships and audit events.');

create function public.authorization_role(role_key text)
returns text language sql immutable strict parallel safe set search_path = ''
as $$ select case role_key when 'developer' then 'agency_director' else role_key end $$;

revoke all on function public.authorization_role(text) from public;
grant execute on function public.authorization_role(text) to authenticated, service_role;

-- Normalize authority at existing permission checks while retaining the real role in records and events.
do $migration$
declare
  routine record;
  definition text;
  body text;
begin
  for routine in
    select p.oid, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private') and p.prokind = 'f'
      and p.proname <> 'authorization_role'
      and (p.prosrc like '%agency_director%' or p.prosrc like '%role_capabilities%')
  loop
    body := regexp_replace(routine.prosrc,
      '([a-z_][a-z0-9_.]*)\s*(=|<>|in)\s*(\(?\s*''agency_director'')',
      'public.authorization_role(\1) \2 \3', 'gi');
    body := regexp_replace(body,
      '(rc\.role_key\s*=\s*)(am\.role_key)',
      '\1public.authorization_role(\2)', 'g');
    if body <> routine.prosrc then
      definition := pg_get_functiondef(routine.oid);
      execute replace(definition, routine.prosrc, body);
    end if;
  end loop;
end;
$migration$;

alter policy pipeline_stages_select_internal on public.pipeline_stages
using (
  exists (
    select 1 from public.agency_memberships am
    where am.user_id = (select auth.uid()) and am.status = 'active'
      and (
        exists (
          select 1 from public.role_capabilities rc
          where rc.role_key = public.authorization_role(am.role_key)
            and rc.capability_key = 'pipeline.view'
        )
        or exists (
          select 1 from public.capability_grants cg
          where cg.user_id = am.user_id and cg.agency_id = am.agency_id
            and cg.capability_key = 'pipeline.view' and cg.revoked_at is null
            and (cg.expires_at is null or cg.expires_at > now())
        )
      )
  )
);

commit;
