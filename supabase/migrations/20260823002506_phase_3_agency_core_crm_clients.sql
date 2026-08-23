-- Phase 3 — Agency Core + CRM + Clients.
-- Organizations remain the canonical commercial account. Client-facing reads
-- use explicit RPC projections; internal CRM authority remains capability + scope.

alter table public.organizations
  drop constraint organizations_lifecycle_check;

update public.organizations
set lifecycle = 'active_client'
where lifecycle = 'client';

alter table public.organizations
  add column domain text,
  add column normalized_domain text generated always as (
    nullif(lower(btrim(domain)), '')
  ) stored,
  add constraint organizations_domain_length
    check (domain is null or char_length(btrim(domain)) between 3 and 253),
  add constraint organizations_domain_format
    check (
      domain is null
      or btrim(domain) ~* '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    ),
  add constraint organizations_lifecycle_check
    check (lifecycle in ('prospect', 'active_client', 'inactive', 'archived'));

create unique index organizations_agency_normalized_domain_unique
  on public.organizations (agency_id, normalized_domain)
  where normalized_domain is not null;

create index organizations_agency_lifecycle_created_idx
  on public.organizations (agency_id, lifecycle, created_at desc, id);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  status text not null default 'active',
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint brands_name_length check (char_length(btrim(name)) between 1 and 160),
  constraint brands_status_check check (status in ('active', 'inactive', 'archived')),
  constraint brands_timezone_length
    check (timezone is null or char_length(btrim(timezone)) between 1 and 80),
  constraint brands_archive_consistency
    check ((status = 'archived') = (archived_at is not null)),
  constraint brands_organization_normalized_name_unique
    unique (organization_id, normalized_name)
);

create index brands_organization_status_idx
  on public.brands (organization_id, status, created_at desc, id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null,
  email text,
  normalized_email text generated always as (
    nullif(lower(btrim(email)), '')
  ) stored,
  phone text,
  job_title text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint contacts_full_name_length
    check (char_length(btrim(full_name)) between 1 and 160),
  constraint contacts_email_length
    check (email is null or char_length(btrim(email)) between 3 and 320),
  constraint contacts_email_format
    check (email is null or btrim(email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint contacts_phone_length
    check (phone is null or char_length(btrim(phone)) between 3 and 40),
  constraint contacts_job_title_length
    check (job_title is null or char_length(btrim(job_title)) between 1 and 120),
  constraint contacts_notes_length
    check (notes is null or char_length(notes) <= 4000),
  constraint contacts_status_check check (status in ('active', 'inactive', 'archived')),
  constraint contacts_archive_consistency
    check ((status = 'archived') = (archived_at is not null))
);

create unique index contacts_organization_normalized_email_unique
  on public.contacts (organization_id, normalized_email)
  where normalized_email is not null;
create index contacts_organization_status_created_idx
  on public.contacts (organization_id, status, created_at desc, id);

create table public.pipeline_stages (
  key text primary key,
  label text not null,
  sort_order smallint not null unique,
  outcome text not null default 'open',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pipeline_stages_key_format check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint pipeline_stages_label_length check (char_length(label) between 1 and 80),
  constraint pipeline_stages_outcome_check check (outcome in ('open', 'won', 'lost')),
  constraint pipeline_stages_terminal_order_check check (
    (outcome = 'open' and sort_order < 900)
    or (outcome in ('won', 'lost') and sort_order >= 900)
  )
);

insert into public.pipeline_stages (key, label, sort_order, outcome) values
  ('lead', 'Lead', 100, 'open'),
  ('discovery', 'Descubrimiento', 200, 'open'),
  ('proposal', 'Propuesta', 300, 'open'),
  ('negotiation', 'Negociación', 400, 'open'),
  ('won', 'Ganada', 900, 'won'),
  ('lost', 'Perdida', 910, 'lost');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete restrict,
  name text not null,
  stage_key text not null default 'lead'
    references public.pipeline_stages(key) on delete restrict,
  estimated_value numeric(14, 2),
  currency text not null default 'MXN',
  owner_id uuid not null references public.profiles(user_id) on delete restrict,
  expected_close_date date,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  archived_at timestamptz,
  constraint opportunities_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint opportunities_estimated_value_check
    check (estimated_value is null or estimated_value >= 0),
  constraint opportunities_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint opportunities_status_check check (status in ('open', 'won', 'lost', 'archived')),
  constraint opportunities_close_consistency check (
    (status = 'open' and closed_at is null and archived_at is null)
    or (status in ('won', 'lost') and closed_at is not null and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create index opportunities_organization_status_created_idx
  on public.opportunities (organization_id, status, created_at desc, id);
create index opportunities_brand_id_idx
  on public.opportunities (brand_id) where brand_id is not null;
create index opportunities_stage_key_idx on public.opportunities (stage_key);
create index opportunities_owner_id_idx on public.opportunities (owner_id);
create index opportunities_expected_close_date_idx
  on public.opportunities (expected_close_date) where expected_close_date is not null;

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete restrict,
  activity_type text not null,
  summary text not null,
  details text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  is_system_generated boolean not null default false,
  created_at timestamptz not null default now(),
  constraint crm_activities_type_check check (
    activity_type in (
      'note', 'call', 'meeting', 'email_reference', 'stage_change',
      'organization_promoted', 'contact_created', 'brand_created',
      'opportunity_created'
    )
  ),
  constraint crm_activities_summary_length
    check (char_length(btrim(summary)) between 1 and 240),
  constraint crm_activities_details_length
    check (details is null or char_length(details) <= 8000),
  constraint crm_activities_single_context check (
    num_nonnulls(brand_id, contact_id, opportunity_id) <= 1
  )
);

create index crm_activities_organization_occurred_idx
  on public.crm_activities (organization_id, occurred_at desc, id);
create index crm_activities_brand_id_idx
  on public.crm_activities (brand_id) where brand_id is not null;
create index crm_activities_contact_id_idx
  on public.crm_activities (contact_id) where contact_id is not null;
create index crm_activities_opportunity_id_idx
  on public.crm_activities (opportunity_id) where opportunity_id is not null;
create index crm_activities_created_by_idx on public.crm_activities (created_by);

create trigger brands_set_updated_at
before update on public.brands
for each row execute function app_private.set_updated_at();
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function app_private.set_updated_at();
create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function app_private.set_updated_at();

create or replace function app_private.enforce_crm_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_organization uuid;
  stage_outcome text;
begin
  if tg_table_name = 'opportunities' then
    if new.brand_id is not null then
      select b.organization_id into related_organization
      from public.brands as b where b.id = new.brand_id;
      if related_organization is distinct from new.organization_id then
        raise exception using errcode = '22023', message = 'brand_organization_mismatch';
      end if;
    end if;

    select ps.outcome into stage_outcome
    from public.pipeline_stages as ps
    where ps.key = new.stage_key and ps.is_active;

    if stage_outcome is null
      or (new.status = 'open' and stage_outcome <> 'open')
      or (new.status = 'won' and stage_outcome <> 'won')
      or (new.status = 'lost' and stage_outcome <> 'lost')
      or (new.status = 'archived' and stage_outcome not in ('open', 'won', 'lost')) then
      raise exception using errcode = '22023', message = 'opportunity_stage_status_mismatch';
    end if;
  elsif tg_table_name = 'crm_activities' then
    if new.brand_id is not null then
      select b.organization_id into related_organization from public.brands b where b.id = new.brand_id;
    elsif new.contact_id is not null then
      select c.organization_id into related_organization from public.contacts c where c.id = new.contact_id;
    elsif new.opportunity_id is not null then
      select o.organization_id into related_organization from public.opportunities o where o.id = new.opportunity_id;
    else
      related_organization := new.organization_id;
    end if;

    if related_organization is distinct from new.organization_id then
      raise exception using errcode = '22023', message = 'activity_organization_mismatch';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function app_private.enforce_crm_relationships()
  from public, anon, authenticated, service_role;

create trigger opportunities_validate_relationships
before insert or update of organization_id, brand_id, stage_key, status
on public.opportunities
for each row execute function app_private.enforce_crm_relationships();

create trigger crm_activities_validate_relationships
before insert or update of organization_id, brand_id, contact_id, opportunity_id
on public.crm_activities
for each row execute function app_private.enforce_crm_relationships();

insert into public.capabilities (key, description, resource_scope_required) values
  ('organization.promote', 'Promote an authorized prospect to an active client.', true),
  ('brand.view', 'View brands within an authorized organization.', true),
  ('brand.create', 'Create brands within an authorized organization.', true),
  ('brand.manage', 'Update or archive brands within an authorized organization.', true),
  ('contact.view', 'View CRM contacts within an authorized organization.', true),
  ('contact.create', 'Create CRM contacts within an authorized organization.', true),
  ('contact.manage', 'Update or archive CRM contacts within an authorized organization.', true),
  ('opportunity.view', 'View opportunities within an authorized organization.', true),
  ('opportunity.create', 'Create opportunities within an authorized organization.', true),
  ('opportunity.manage', 'Change or archive opportunities within an authorized organization.', true),
  ('crm_activity.view', 'View internal CRM activity within an authorized organization.', true),
  ('crm_activity.create', 'Record internal CRM activity within an authorized organization.', true),
  ('pipeline.view', 'View the controlled internal opportunity stage catalog.', true);

insert into public.role_capabilities (role_key, capability_key)
select 'agency_director', c.key
from public.capabilities as c
where c.key in (
  'organization.promote', 'brand.view', 'brand.create', 'brand.manage',
  'contact.view', 'contact.create', 'contact.manage',
  'opportunity.view', 'opportunity.create', 'opportunity.manage',
  'crm_activity.view', 'crm_activity.create', 'pipeline.view'
);

create or replace function app_private.create_crm_organization(
  p_name text,
  p_domain text,
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
  actor_agency uuid;
  created_id uuid;
  correlation uuid := gen_random_uuid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select am.agency_id into actor_agency
  from public.agency_memberships am
  where am.user_id = actor and am.status = 'active'
    and public.has_capability('organization.create', am.agency_id, null)
  order by am.created_at limit 1;

  if actor_agency is null then
    raise exception using errcode = '42501', message = 'organization_create_forbidden';
  end if;

  select de.resource_id into created_id
  from public.domain_events de
  where de.actor_id = actor
    and de.event_type = 'organization.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;

  if char_length(btrim(p_name)) not between 1 and 200
    or char_length(btrim(p_timezone)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid_organization_input';
  end if;

  insert into public.organizations (agency_id, name, domain, lifecycle, timezone)
  values (actor_agency, btrim(p_name), nullif(btrim(p_domain), ''), 'prospect', btrim(p_timezone))
  returning id into created_id;

  perform app_private.emit_event(
    'organization.created', actor, 'organization', created_id,
    actor_agency, created_id, correlation, p_idempotency_key,
    jsonb_build_object('lifecycle', 'prospect')
  );
  return created_id;
end;
$$;

create or replace function public.create_crm_organization(
  name text, domain text, timezone text, idempotency_key uuid
)
returns uuid
language sql volatile security definer set search_path = ''
as $$ select app_private.create_crm_organization($1, $2, $3, $4); $$;

create or replace function app_private.update_organization(
  p_organization_id uuid,
  p_name text,
  p_domain text,
  p_timezone text,
  p_lifecycle text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.organizations%rowtype;
  correlation uuid := gen_random_uuid();
begin
  select * into target from public.organizations where id = p_organization_id for update;
  if target.id is null
    or actor is null
    or not public.has_capability('organization.manage', target.agency_id, target.id) then
    raise exception using errcode = '42501', message = 'organization_manage_forbidden';
  end if;
  if p_lifecycle not in ('prospect', 'active_client', 'inactive')
    or char_length(btrim(p_name)) not between 1 and 200
    or char_length(btrim(p_timezone)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid_organization_input';
  end if;
  if target.lifecycle = 'prospect' and p_lifecycle = 'active_client' then
    raise exception using errcode = '22023', message = 'organization_promotion_command_required';
  end if;

  update public.organizations
  set name = btrim(p_name), domain = nullif(btrim(p_domain), ''),
      timezone = btrim(p_timezone), lifecycle = p_lifecycle, archived_at = null
  where id = target.id;

  perform app_private.emit_event(
    'organization.updated', actor, 'organization', target.id,
    target.agency_id, target.id, correlation, null,
    jsonb_build_object('lifecycle', p_lifecycle)
  );
  return target.id;
end;
$$;

create or replace function public.update_organization(
  organization_id uuid, name text, domain text, timezone text, lifecycle text
)
returns uuid
language sql volatile security definer set search_path = ''
as $$ select app_private.update_organization($1, $2, $3, $4, $5); $$;

create or replace function app_private.promote_organization_to_client(
  p_organization_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.organizations%rowtype;
  original_resource uuid;
  correlation uuid := gen_random_uuid();
begin
  select de.resource_id into original_resource
  from public.domain_events de
  where de.actor_id = actor
    and de.event_type = 'organization.promoted'
    and de.idempotency_key = p_idempotency_key;
  if original_resource is not null then return original_resource; end if;

  select * into target from public.organizations where id = p_organization_id for update;
  if target.id is null or actor is null
    or not public.has_capability('organization.promote', target.agency_id, target.id) then
    raise exception using errcode = '42501', message = 'organization_promote_forbidden';
  end if;
  if target.lifecycle <> 'prospect' then
    raise exception using errcode = '22023', message = 'organization_not_prospect';
  end if;
  if not exists (select 1 from public.brands b where b.organization_id = target.id and b.status = 'active') then
    raise exception using errcode = '22023', message = 'active_brand_required';
  end if;

  update public.organizations
  set lifecycle = 'active_client', archived_at = null
  where id = target.id;

  insert into public.crm_activities (
    organization_id, activity_type, summary, created_by, is_system_generated
  ) values (
    target.id, 'organization_promoted', 'Organization promoted to active client', actor, true
  );

  perform app_private.emit_event(
    'organization.promoted', actor, 'organization', target.id,
    target.agency_id, target.id, correlation, p_idempotency_key,
    jsonb_build_object('from', 'prospect', 'to', 'active_client')
  );
  return target.id;
end;
$$;

create or replace function public.promote_organization_to_client(
  organization_id uuid, idempotency_key uuid
)
returns uuid
language sql volatile security definer set search_path = ''
as $$ select app_private.promote_organization_to_client($1, $2); $$;

create or replace function app_private.create_brand(
  p_organization_id uuid, p_name text, p_timezone text, p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid()); target public.organizations%rowtype;
  created_id uuid; correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created_id from public.domain_events de
  where de.actor_id = actor and de.event_type = 'brand.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;
  select * into target from public.organizations where id = p_organization_id;
  if target.id is null or actor is null
    or not public.has_capability('brand.create', target.agency_id, target.id) then
    raise exception using errcode = '42501', message = 'brand_create_forbidden';
  end if;
  insert into public.brands (organization_id, name, timezone)
  values (target.id, btrim(p_name), nullif(btrim(p_timezone), '')) returning id into created_id;
  insert into public.crm_activities (organization_id, brand_id, activity_type, summary, created_by, is_system_generated)
  values (target.id, created_id, 'brand_created', 'Brand created: ' || btrim(p_name), actor, true);
  perform app_private.emit_event('brand.created', actor, 'brand', created_id,
    target.agency_id, target.id, correlation, p_idempotency_key, '{}'::jsonb);
  return created_id;
end;
$$;

create or replace function public.create_brand(
  organization_id uuid, name text, timezone text, idempotency_key uuid
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select app_private.create_brand($1, $2, $3, $4); $$;

create or replace function app_private.create_contact(
  p_organization_id uuid, p_full_name text, p_email text, p_phone text,
  p_job_title text, p_notes text, p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid()); target public.organizations%rowtype;
  created_id uuid; correlation uuid := gen_random_uuid();
begin
  select de.resource_id into created_id from public.domain_events de
  where de.actor_id = actor and de.event_type = 'contact.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;
  select * into target from public.organizations where id = p_organization_id;
  if target.id is null or actor is null
    or not public.has_capability('contact.create', target.agency_id, target.id) then
    raise exception using errcode = '42501', message = 'contact_create_forbidden';
  end if;
  insert into public.contacts (organization_id, full_name, email, phone, job_title, notes)
  values (target.id, btrim(p_full_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
    nullif(btrim(p_job_title), ''), nullif(btrim(p_notes), '')) returning id into created_id;
  insert into public.crm_activities (organization_id, contact_id, activity_type, summary, created_by, is_system_generated)
  values (target.id, created_id, 'contact_created', 'Contact created: ' || btrim(p_full_name), actor, true);
  perform app_private.emit_event('contact.created', actor, 'contact', created_id,
    target.agency_id, target.id, correlation, p_idempotency_key, '{}'::jsonb);
  return created_id;
end;
$$;

create or replace function public.create_contact(
  organization_id uuid, full_name text, email text, phone text,
  job_title text, notes text, idempotency_key uuid
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select app_private.create_contact($1, $2, $3, $4, $5, $6, $7); $$;

create or replace function app_private.create_opportunity(
  p_organization_id uuid, p_brand_id uuid, p_name text, p_stage_key text,
  p_estimated_value numeric, p_currency text, p_owner_id uuid,
  p_expected_close_date date, p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid()); target public.organizations%rowtype;
  created_id uuid; correlation uuid := gen_random_uuid(); stage_outcome text;
begin
  select de.resource_id into created_id from public.domain_events de
  where de.actor_id = actor and de.event_type = 'opportunity.created'
    and de.idempotency_key = p_idempotency_key;
  if created_id is not null then return created_id; end if;
  select * into target from public.organizations where id = p_organization_id;
  if target.id is null or actor is null
    or not public.has_capability('opportunity.create', target.agency_id, target.id) then
    raise exception using errcode = '42501', message = 'opportunity_create_forbidden';
  end if;
  select ps.outcome into stage_outcome from public.pipeline_stages ps
  where ps.key = p_stage_key and ps.is_active;
  if stage_outcome is distinct from 'open' then
    raise exception using errcode = '22023', message = 'initial_stage_must_be_open';
  end if;
  if not exists (
    select 1 from public.agency_memberships am
    where am.user_id = p_owner_id and am.agency_id = target.agency_id and am.status = 'active'
  ) then raise exception using errcode = '22023', message = 'invalid_opportunity_owner'; end if;
  insert into public.opportunities (
    organization_id, brand_id, name, stage_key, estimated_value,
    currency, owner_id, expected_close_date
  ) values (
    target.id, p_brand_id, btrim(p_name), p_stage_key, p_estimated_value,
    upper(btrim(p_currency)), p_owner_id, p_expected_close_date
  ) returning id into created_id;
  insert into public.crm_activities (organization_id, opportunity_id, activity_type, summary, created_by, is_system_generated)
  values (target.id, created_id, 'opportunity_created', 'Opportunity created: ' || btrim(p_name), actor, true);
  perform app_private.emit_event('opportunity.created', actor, 'opportunity', created_id,
    target.agency_id, target.id, correlation, p_idempotency_key,
    jsonb_build_object('stage', p_stage_key));
  return created_id;
end;
$$;

create or replace function public.create_opportunity(
  organization_id uuid, brand_id uuid, name text, stage_key text,
  estimated_value numeric, currency text, owner_id uuid,
  expected_close_date date, idempotency_key uuid
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select app_private.create_opportunity($1,$2,$3,$4,$5,$6,$7,$8,$9); $$;

create or replace function app_private.change_opportunity_stage(
  p_opportunity_id uuid, p_stage_key text, p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid()); target public.opportunities%rowtype;
  target_org public.organizations%rowtype; next_outcome text; next_status text;
  correlation uuid := gen_random_uuid(); event_name text;
begin
  if exists (select 1 from public.domain_events de where de.actor_id = actor
    and de.event_type in ('opportunity.stage_changed','opportunity.won','opportunity.lost')
    and de.idempotency_key = p_idempotency_key) then return p_opportunity_id; end if;
  select * into target from public.opportunities where id = p_opportunity_id for update;
  select * into target_org from public.organizations where id = target.organization_id;
  if target.id is null or actor is null or target.status = 'archived'
    or not public.has_capability('opportunity.manage', target_org.agency_id, target_org.id) then
    raise exception using errcode = '42501', message = 'opportunity_manage_forbidden';
  end if;
  select ps.outcome into next_outcome from public.pipeline_stages ps
  where ps.key = p_stage_key and ps.is_active;
  if next_outcome is null then raise exception using errcode = '22023', message = 'invalid_pipeline_stage'; end if;
  next_status := case next_outcome when 'won' then 'won' when 'lost' then 'lost' else 'open' end;
  update public.opportunities set stage_key = p_stage_key, status = next_status,
    closed_at = case when next_status in ('won','lost') then now() else null end
  where id = target.id;
  insert into public.crm_activities (organization_id, opportunity_id, activity_type, summary, details, created_by, is_system_generated)
  values (target.organization_id, target.id, 'stage_change', 'Opportunity stage changed',
    target.stage_key || ' → ' || p_stage_key, actor, true);
  event_name := case next_status when 'won' then 'opportunity.won' when 'lost' then 'opportunity.lost' else 'opportunity.stage_changed' end;
  perform app_private.emit_event(event_name, actor, 'opportunity', target.id,
    target_org.agency_id, target_org.id, correlation, p_idempotency_key,
    jsonb_build_object('from', target.stage_key, 'to', p_stage_key));
  return target.id;
end;
$$;

create or replace function public.change_opportunity_stage(
  opportunity_id uuid, stage_key text, idempotency_key uuid
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select app_private.change_opportunity_stage($1,$2,$3); $$;

create or replace function app_private.create_crm_activity(
  p_organization_id uuid, p_activity_type text, p_summary text, p_details text,
  p_brand_id uuid, p_contact_id uuid, p_opportunity_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid()); target public.organizations%rowtype; created_id uuid;
begin
  select * into target from public.organizations where id = p_organization_id;
  if target.id is null or actor is null
    or not public.has_capability('crm_activity.create', target.agency_id, target.id) then
    raise exception using errcode = '42501', message = 'crm_activity_create_forbidden';
  end if;
  if p_activity_type not in ('note','call','meeting','email_reference') then
    raise exception using errcode = '22023', message = 'invalid_manual_activity_type';
  end if;
  insert into public.crm_activities (
    organization_id, brand_id, contact_id, opportunity_id,
    activity_type, summary, details, created_by
  ) values (
    target.id, p_brand_id, p_contact_id, p_opportunity_id,
    p_activity_type, btrim(p_summary), nullif(btrim(p_details), ''), actor
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.create_crm_activity(
  organization_id uuid, activity_type text, summary text, details text,
  brand_id uuid, contact_id uuid, opportunity_id uuid
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select app_private.create_crm_activity($1,$2,$3,$4,$5,$6,$7); $$;

create or replace function app_private.archive_crm_resource(
  p_resource_type text, p_resource_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid()); organization_id uuid; agency_id uuid;
  required_capability text; correlation uuid := gen_random_uuid();
begin
  if p_resource_type = 'organization' then
    select o.id, o.agency_id into organization_id, agency_id from public.organizations o where o.id = p_resource_id for update;
    required_capability := 'organization.manage';
  elsif p_resource_type = 'brand' then
    select b.organization_id, o.agency_id into organization_id, agency_id from public.brands b join public.organizations o on o.id=b.organization_id where b.id=p_resource_id for update of b;
    required_capability := 'brand.manage';
  elsif p_resource_type = 'contact' then
    select c.organization_id, o.agency_id into organization_id, agency_id from public.contacts c join public.organizations o on o.id=c.organization_id where c.id=p_resource_id for update of c;
    required_capability := 'contact.manage';
  elsif p_resource_type = 'opportunity' then
    select op.organization_id, o.agency_id into organization_id, agency_id from public.opportunities op join public.organizations o on o.id=op.organization_id where op.id=p_resource_id for update of op;
    required_capability := 'opportunity.manage';
  else raise exception using errcode='22023', message='unsupported_archive_resource'; end if;
  if organization_id is null or actor is null or not public.has_capability(required_capability, agency_id, organization_id) then
    raise exception using errcode='42501', message='crm_archive_forbidden';
  end if;
  if p_resource_type = 'organization' then update public.organizations set lifecycle='archived', archived_at=now() where id=p_resource_id;
  elsif p_resource_type = 'brand' then update public.brands set status='archived', archived_at=now() where id=p_resource_id;
  elsif p_resource_type = 'contact' then update public.contacts set status='archived', archived_at=now() where id=p_resource_id;
  else update public.opportunities set status='archived', archived_at=now() where id=p_resource_id; end if;
  perform app_private.emit_event(p_resource_type || '.archived', actor, p_resource_type, p_resource_id,
    agency_id, organization_id, correlation, null, '{}'::jsonb);
  return p_resource_id;
end;
$$;

create or replace function public.archive_crm_resource(resource_type text, resource_id uuid)
returns uuid language sql volatile security definer set search_path = ''
as $$ select app_private.archive_crm_resource($1,$2); $$;

create or replace function public.client_organization_context()
returns table (organization_id uuid, organization_name text, timezone text)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.timezone
  from public.organizations o
  join public.client_memberships cm on cm.organization_id = o.id
  where cm.user_id = (select auth.uid()) and cm.status = 'active'
    and o.lifecycle = 'active_client';
$$;

create or replace function public.client_brand_context(organization_id uuid default null)
returns table (brand_id uuid, brand_name text, parent_organization_id uuid, timezone text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.organization_id, coalesce(b.timezone, o.timezone)
  from public.brands b
  join public.organizations o on o.id = b.organization_id
  join public.client_memberships cm on cm.organization_id = o.id
  where cm.user_id = (select auth.uid()) and cm.status = 'active'
    and o.lifecycle = 'active_client' and b.status = 'active'
    and ($1 is null or o.id = $1)
  order by b.name, b.id;
$$;

revoke all on function app_private.create_crm_organization(text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.update_organization(uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function app_private.promote_organization_to_client(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.create_brand(uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.create_contact(uuid,text,text,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.create_opportunity(uuid,uuid,text,text,numeric,text,uuid,date,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.change_opportunity_stage(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.create_crm_activity(uuid,text,text,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.archive_crm_resource(text,uuid) from public,anon,authenticated,service_role;

revoke execute on function public.create_crm_organization(text,text,text,uuid) from public,anon;
revoke execute on function public.update_organization(uuid,text,text,text,text) from public,anon;
revoke execute on function public.promote_organization_to_client(uuid,uuid) from public,anon;
revoke execute on function public.create_brand(uuid,text,text,uuid) from public,anon;
revoke execute on function public.create_contact(uuid,text,text,text,text,text,uuid) from public,anon;
revoke execute on function public.create_opportunity(uuid,uuid,text,text,numeric,text,uuid,date,uuid) from public,anon;
revoke execute on function public.change_opportunity_stage(uuid,text,uuid) from public,anon;
revoke execute on function public.create_crm_activity(uuid,text,text,text,uuid,uuid,uuid) from public,anon;
revoke execute on function public.archive_crm_resource(text,uuid) from public,anon;
revoke execute on function public.client_organization_context() from public,anon;
revoke execute on function public.client_brand_context(uuid) from public,anon;

grant execute on function public.create_crm_organization(text,text,text,uuid) to authenticated;
grant execute on function public.update_organization(uuid,text,text,text,text) to authenticated;
grant execute on function public.promote_organization_to_client(uuid,uuid) to authenticated;
grant execute on function public.create_brand(uuid,text,text,uuid) to authenticated;
grant execute on function public.create_contact(uuid,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.create_opportunity(uuid,uuid,text,text,numeric,text,uuid,date,uuid) to authenticated;
grant execute on function public.change_opportunity_stage(uuid,text,uuid) to authenticated;
grant execute on function public.create_crm_activity(uuid,text,text,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.archive_crm_resource(text,uuid) to authenticated;
grant execute on function public.client_organization_context() to authenticated;
grant execute on function public.client_brand_context(uuid) to authenticated;

alter table public.brands enable row level security;
alter table public.brands force row level security;
alter table public.contacts enable row level security;
alter table public.contacts force row level security;
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_stages force row level security;
alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_activities force row level security;

drop policy organizations_select_authorized on public.organizations;
create policy organizations_select_internal on public.organizations
for select to authenticated
using (
  exists (
    select 1 from public.agency_memberships am
    where am.user_id = (select auth.uid()) and am.status = 'active'
      and am.agency_id = organizations.agency_id
  )
  and public.has_capability('organization.view', agency_id, id)
);

create policy brands_select_internal on public.brands
for select to authenticated
using (
  exists (
    select 1 from public.organizations o
    join public.agency_memberships am on am.agency_id = o.agency_id
    where o.id = brands.organization_id
      and am.user_id = (select auth.uid()) and am.status = 'active'
      and public.has_capability('brand.view', o.agency_id, o.id)
  )
);

create policy contacts_select_internal on public.contacts
for select to authenticated
using (
  exists (
    select 1 from public.organizations o
    join public.agency_memberships am on am.agency_id = o.agency_id
    where o.id = contacts.organization_id
      and am.user_id = (select auth.uid()) and am.status = 'active'
      and public.has_capability('contact.view', o.agency_id, o.id)
  )
);

create policy opportunities_select_internal on public.opportunities
for select to authenticated
using (
  exists (
    select 1 from public.organizations o
    join public.agency_memberships am on am.agency_id = o.agency_id
    where o.id = opportunities.organization_id
      and am.user_id = (select auth.uid()) and am.status = 'active'
      and public.has_capability('opportunity.view', o.agency_id, o.id)
  )
);

create policy crm_activities_select_internal on public.crm_activities
for select to authenticated
using (
  exists (
    select 1 from public.organizations o
    join public.agency_memberships am on am.agency_id = o.agency_id
    where o.id = crm_activities.organization_id
      and am.user_id = (select auth.uid()) and am.status = 'active'
      and public.has_capability('crm_activity.view', o.agency_id, o.id)
  )
);

create policy pipeline_stages_select_internal on public.pipeline_stages
for select to authenticated
using (
  exists (
    select 1
    from public.agency_memberships am
    where am.user_id = (select auth.uid()) and am.status = 'active'
      and (
        exists (
          select 1 from public.role_capabilities rc
          where rc.role_key = am.role_key and rc.capability_key = 'pipeline.view'
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

revoke all on public.brands, public.contacts, public.pipeline_stages,
  public.opportunities, public.crm_activities from anon, authenticated;
grant select on public.brands, public.contacts, public.pipeline_stages,
  public.opportunities, public.crm_activities to authenticated;

comment on table public.organizations is
  'Canonical commercial account for prospects and active clients. Client reads use explicit projection RPCs.';
comment on table public.brands is
  'Brand context below an Organization. Projects may reference a Brand only from Phase 4 onward.';
comment on table public.contacts is
  'CRM contacts are not Auth users and do not imply client membership.';
comment on table public.pipeline_stages is
  'Server-managed Phase 3 opportunity pipeline catalog.';
comment on table public.crm_activities is
  'Human CRM context; authoritative history remains in domain_events and audit_events.';
