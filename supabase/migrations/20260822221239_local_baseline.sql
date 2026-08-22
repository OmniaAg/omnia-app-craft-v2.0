-- Phase 1 infrastructure only. Product schemas and tables begin in later phases.
create schema if not exists app_private authorization postgres;

revoke all on schema app_private from public, anon, authenticated;

alter default privileges for role postgres in schema app_private
  revoke all on tables from public;
alter default privileges for role postgres in schema app_private
  revoke all on sequences from public;
alter default privileges for role postgres in schema app_private
  revoke execute on functions from public;

comment on schema app_private is
  'Private OMNIA application infrastructure; never exposed through the Data API.';

create or replace function public.health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('status', 'ok');
$$;

revoke execute on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;

comment on function public.health_check() is
  'Non-sensitive local connectivity diagnostic for the OMNIA Supabase adapter.';
