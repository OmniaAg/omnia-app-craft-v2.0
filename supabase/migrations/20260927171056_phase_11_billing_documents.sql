-- Phase 11 - Billing Tracking & Documents

insert into public.capabilities (key, description, resource_scope_required) values
  ('billing.view', 'View billing documents and payments within scope.', true),
  ('billing.create', 'Create billing documents within scope.', true),
  ('billing.issue', 'Issue billing documents within scope.', true),
  ('billing.record_payment', 'Record payments for billing documents within scope.', true),
  ('billing.void_payment', 'Void payments for billing documents within scope.', true),
  ('billing.publish', 'Publish billing documents to client portal within scope.', true),
  ('document.view', 'View commercial documents within scope.', true),
  ('document.manage', 'Manage commercial documents within scope.', true),
  ('document.publish', 'Publish commercial documents to client portal within scope.', true);

insert into public.role_capabilities (role_key, capability_key)
select 'agency_director', key from public.capabilities where key like 'billing.%' or key like 'document.%';

-- PMs don't get billing capabilities globally. They get them via project_access_allowed explicitly per project.

create type public.billing_document_type as enum (
  'quote', 'estimate', 'invoice_like', 'payment_request', 'receipt', 'other'
);

create type public.billing_document_status as enum (
  'draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'archived'
);

create type public.payment_method as enum (
  'transfer', 'cash', 'card', 'other'
);

create type public.payment_schedule_type as enum (
  '100_percent', '50_50', 'custom'
);

create sequence public.billing_document_seq;

create table public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  type public.billing_document_type not null default 'invoice_like',
  status public.billing_document_status not null default 'draft',
  
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  
  date date not null default current_date,
  due_date date,
  currency text not null default 'MXN',
  
  subtotal_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  
  notes text,
  
  published_to_client boolean not null default false,
  published_at timestamptz,
  
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(user_id) on delete restrict,
  issued_at timestamptz,
  issued_by uuid references public.profiles(user_id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(user_id) on delete restrict,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  
  constraint positive_amounts check (subtotal_amount >= 0 and tax_amount >= 0 and total_amount >= 0),
  constraint total_math check (total_amount = subtotal_amount + tax_amount)
);

create index billing_documents_organization_id_idx on public.billing_documents (organization_id);
create index billing_documents_project_id_idx on public.billing_documents (project_id);
create index billing_documents_status_idx on public.billing_documents (status);

create table public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  type public.payment_schedule_type not null default '100_percent',
  installments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_schedules_document_id_idx on public.payment_schedules (billing_document_id);

create table public.billing_document_items (
  id uuid primary key default gen_random_uuid(),
  billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  description text not null,
  quantity numeric(14,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint positive_line check (quantity >= 0 and unit_price >= 0 and line_total = quantity * unit_price)
);

create index billing_document_items_document_id_idx on public.billing_document_items (billing_document_id);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  billing_document_id uuid not null references public.billing_documents(id) on delete restrict,
  amount numeric(14,2) not null,
  currency text not null,
  received_at timestamptz not null,
  method public.payment_method not null,
  reference text,
  notes text,
  
  file_asset_id uuid references public.file_assets(id) on delete restrict,
  
  created_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(user_id) on delete restrict,
  
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  
  constraint positive_payment check (amount > 0)
);

create index payment_records_document_id_idx on public.payment_records (billing_document_id);

create table public.billing_document_files (
  billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id) on delete cascade,
  primary key (billing_document_id, file_asset_id)
);

-- Triggers for updated_at
create trigger billing_documents_set_updated_at
before update on public.billing_documents
for each row execute function app_private.set_updated_at();

create trigger payment_schedules_set_updated_at
before update on public.payment_schedules
for each row execute function app_private.set_updated_at();

create trigger billing_document_items_set_updated_at
before update on public.billing_document_items
for each row execute function app_private.set_updated_at();

create trigger payment_records_set_updated_at
before update on public.payment_records
for each row execute function app_private.set_updated_at();

-- Trigger to freeze fields after issue
create or replace function app_private.freeze_issued_billing_document()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    if new.subtotal_amount <> old.subtotal_amount or
       new.tax_amount <> old.tax_amount or
       new.total_amount <> old.total_amount or
       new.currency <> old.currency or
       new.organization_id <> old.organization_id or
       new.project_id is distinct from old.project_id then
      raise exception using errcode = '27000', message = 'Cannot modify commercial fields of an issued document.';
    end if;
  end if;
  return new;
end;
$$;

create trigger freeze_issued_billing_document_trg
before update on public.billing_documents
for each row execute function app_private.freeze_issued_billing_document();

-- Trigger to freeze items after issue
create or replace function app_private.freeze_issued_billing_document_items()
returns trigger
language plpgsql
as $$
declare
  doc_status text;
begin
  select status into doc_status from public.billing_documents where id = coalesce(new.billing_document_id, old.billing_document_id);
  if doc_status <> 'draft' then
    raise exception using errcode = '27000', message = 'Cannot modify items of an issued document.';
  end if;
  
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger freeze_issued_billing_document_items_trg
before insert or update or delete on public.billing_document_items
for each row execute function app_private.freeze_issued_billing_document_items();

create trigger freeze_issued_payment_schedules_trg
before insert or update or delete on public.payment_schedules
for each row execute function app_private.freeze_issued_billing_document_items();

-- RLS Enable
alter table public.billing_documents enable row level security;
alter table public.payment_schedules enable row level security;
alter table public.billing_document_items enable row level security;
alter table public.payment_records enable row level security;
alter table public.billing_document_files enable row level security;

-- Grants
grant all on public.billing_documents to authenticated, service_role;
grant all on public.payment_schedules to authenticated, service_role;
grant all on public.billing_document_items to authenticated, service_role;
grant all on public.payment_records to authenticated, service_role;
grant all on public.billing_document_files to authenticated, service_role;

-- Read policies
create policy "Internal actors with capability can view billing documents"
  on public.billing_documents
  for select
  using (
    public.is_internal_actor() and (
      (project_id is not null and public.project_access_allowed(project_id, 'billing.view'))
      or
      public.has_capability('billing.view', (select agency_id from public.organizations o where o.id = organization_id), organization_id)
    )
  );

create policy "Actors can view items of viewable documents"
  on public.billing_document_items
  for select
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = billing_document_items.billing_document_id
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.view'))
        or public.has_capability('billing.view', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

create policy "Actors can view schedules of viewable documents"
  on public.payment_schedules
  for select
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = payment_schedules.billing_document_id
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.view'))
        or public.has_capability('billing.view', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

create policy "Actors can view payments of viewable documents"
  on public.payment_records
  for select
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = payment_records.billing_document_id
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.view'))
        or public.has_capability('billing.view', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

create policy "Actors can view files of viewable documents"
  on public.billing_document_files
  for select
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = billing_document_files.billing_document_id
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.view'))
        or public.has_capability('billing.view', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

-- Write policies for drafts
create policy "Actors with capability can create draft billing documents"
  on public.billing_documents
  for insert
  with check (
    status = 'draft' and
    public.is_internal_actor() and (
      (project_id is not null and public.project_access_allowed(project_id, 'billing.create'))
      or
      public.has_capability('billing.create', (select agency_id from public.organizations o where o.id = organization_id), organization_id)
    )
  );

create policy "Actors with capability can update draft billing documents"
  on public.billing_documents
  for update
  using (
    public.is_internal_actor() and (
      (project_id is not null and public.project_access_allowed(project_id, 'billing.create'))
      or
      public.has_capability('billing.create', (select agency_id from public.organizations o where o.id = organization_id), organization_id)
    )
  );

create policy "Actors with capability can manage draft document items"
  on public.billing_document_items
  for all
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = billing_document_items.billing_document_id
      and bd.status = 'draft'
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.create'))
        or public.has_capability('billing.create', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

create policy "Actors with capability can manage draft schedules"
  on public.payment_schedules
  for all
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = payment_schedules.billing_document_id
      and bd.status = 'draft'
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.create'))
        or public.has_capability('billing.create', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

create policy "Actors with capability can manage draft document files"
  on public.billing_document_files
  for all
  using (
    exists (
      select 1 from public.billing_documents bd
      where bd.id = billing_document_files.billing_document_id
      and public.is_internal_actor() and (
        (bd.project_id is not null and public.project_access_allowed(bd.project_id, 'billing.manage')) -- Changed from billing.create for files? Just keep billing.create or add billing.manage if needed. We'll use billing.create.
        or public.has_capability('billing.create', (select agency_id from public.organizations o where o.id = bd.organization_id), bd.organization_id)
      )
    )
  );

-- RPCs
create or replace function public.issue_billing_document(
  p_document_id uuid,
  p_idempotency_key uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_doc public.billing_documents%rowtype;
  target_organization uuid;
  target_agency uuid;
  new_number text;
  year_str text := to_char(now(), 'YYYY');
  seq_num int;
  created_event uuid;
begin
  if p_idempotency_key is not null then
    select de.resource_id into created_event
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.document.issued'
      and de.idempotency_key = p_idempotency_key;
    if created_event is not null then return created_event; end if;
  end if;

  select * into target_doc from public.billing_documents where id = p_document_id for update;
  if target_doc.id is null then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target_doc.status <> 'draft' then raise exception using errcode = 'P0001', message = 'not_draft'; end if;

  select o.id, o.agency_id into target_organization, target_agency
  from public.organizations o where o.id = target_doc.organization_id;

  if not public.is_internal_actor() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if target_doc.project_id is not null and not public.project_access_allowed(target_doc.project_id, 'billing.issue') then
    if not public.has_capability('billing.issue', target_agency, target_organization) then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  elsif target_doc.project_id is null and not public.has_capability('billing.issue', target_agency, target_organization) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  -- Verify total math
  if target_doc.total_amount <> (target_doc.subtotal_amount + target_doc.tax_amount) then
    raise exception using errcode = '23514', message = 'invalid_totals';
  end if;
  
  -- Verify items total math
  declare
    items_total numeric(14,2);
  begin
    select coalesce(sum(line_total), 0) into items_total from public.billing_document_items where billing_document_id = p_document_id;
    if items_total <> target_doc.subtotal_amount then
       raise exception using errcode = '23514', message = 'items_total_mismatch';
    end if;
  end;

  seq_num := nextval('public.billing_document_seq');
  new_number := 'OMNIA-' || year_str || '-' || lpad(seq_num::text, 6, '0');

  update public.billing_documents
  set status = 'issued',
      number = new_number,
      issued_at = now(),
      issued_by = actor
  where id = p_document_id;

  perform app_private.emit_event(
    'billing.document.issued', actor, 'billing_document', p_document_id,
    target_agency, target_organization, p_document_id, p_idempotency_key, '{}'::jsonb
  );

  return p_document_id;
end;
$$;

create or replace function public.record_payment(
  p_document_id uuid,
  p_amount numeric(14,2),
  p_method public.payment_method,
  p_received_at timestamptz,
  p_reference text,
  p_notes text,
  p_file_asset_id uuid,
  p_idempotency_key uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_doc public.billing_documents%rowtype;
  target_organization uuid;
  target_agency uuid;
  payment_id uuid;
  paid_amount numeric(14,2);
  new_status public.billing_document_status;
begin
  if p_idempotency_key is not null then
    select de.resource_id into payment_id
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.payment.recorded'
      and de.idempotency_key = p_idempotency_key;
    if payment_id is not null then return payment_id; end if;
  end if;

  select * into target_doc from public.billing_documents where id = p_document_id for update;
  if target_doc.id is null then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target_doc.status not in ('issued', 'partially_paid') then raise exception using errcode = 'P0001', message = 'invalid_document_status'; end if;

  select o.id, o.agency_id into target_organization, target_agency
  from public.organizations o where o.id = target_doc.organization_id;

  if not public.is_internal_actor() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if target_doc.project_id is not null and not public.project_access_allowed(target_doc.project_id, 'billing.record_payment') then
    if not public.has_capability('billing.record_payment', target_agency, target_organization) then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  elsif target_doc.project_id is null and not public.has_capability('billing.record_payment', target_agency, target_organization) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_amount <= 0 then raise exception using errcode = '23514', message = 'invalid_amount'; end if;

  -- Overpayment validation
  select coalesce(sum(amount), 0) into paid_amount
  from public.payment_records
  where billing_document_id = p_document_id and voided_at is null;

  if (paid_amount + p_amount) > target_doc.total_amount then
    raise exception using errcode = '23514', message = 'overpayment_rejected';
  end if;

  insert into public.payment_records (
    billing_document_id, amount, currency, received_at, method, reference, notes, file_asset_id, recorded_by
  ) values (
    p_document_id, p_amount, target_doc.currency, p_received_at, p_method, p_reference, p_notes, p_file_asset_id, actor
  ) returning id into payment_id;

  if (paid_amount + p_amount) >= target_doc.total_amount then
    new_status := 'paid';
  else
    new_status := 'partially_paid';
  end if;

  update public.billing_documents
  set status = new_status
  where id = p_document_id;

  perform app_private.emit_event(
    'billing.payment.recorded', actor, 'payment_record', payment_id,
    target_agency, target_organization, p_document_id, p_idempotency_key, '{}'::jsonb
  );

  return payment_id;
end;
$$;

create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_payment public.payment_records%rowtype;
  target_doc public.billing_documents%rowtype;
  target_organization uuid;
  target_agency uuid;
  void_event uuid;
  paid_amount numeric(14,2);
  new_status public.billing_document_status;
begin
  if p_idempotency_key is not null then
    select de.resource_id into void_event
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.payment.voided'
      and de.idempotency_key = p_idempotency_key;
    if void_event is not null then return p_payment_id; end if;
  end if;

  select * into target_payment from public.payment_records where id = p_payment_id for update;
  if target_payment.id is null then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target_payment.voided_at is not null then return p_payment_id; end if;

  select * into target_doc from public.billing_documents where id = target_payment.billing_document_id for update;
  select o.id, o.agency_id into target_organization, target_agency
  from public.organizations o where o.id = target_doc.organization_id;

  if not public.is_internal_actor() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if target_doc.project_id is not null and not public.project_access_allowed(target_doc.project_id, 'billing.void_payment') then
    if not public.has_capability('billing.void_payment', target_agency, target_organization) then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  elsif target_doc.project_id is null and not public.has_capability('billing.void_payment', target_agency, target_organization) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then raise exception using errcode = '23514', message = 'reason_required'; end if;

  update public.payment_records
  set voided_at = now(),
      void_reason = p_reason,
      voided_by = actor
  where id = p_payment_id;

  select coalesce(sum(amount), 0) into paid_amount
  from public.payment_records
  where billing_document_id = target_doc.id and voided_at is null;

  if paid_amount >= target_doc.total_amount then
    new_status := 'paid';
  elsif paid_amount > 0 then
    new_status := 'partially_paid';
  else
    new_status := 'issued';
  end if;

  update public.billing_documents
  set status = new_status
  where id = target_doc.id;

  perform app_private.emit_event(
    'billing.payment.voided', actor, 'payment_record', p_payment_id,
    target_agency, target_organization, target_doc.id, p_idempotency_key, jsonb_build_object('reason', p_reason)
  );

  return p_payment_id;
end;
$$;

create or replace function public.publish_billing_document(
  p_document_id uuid,
  p_idempotency_key uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_doc public.billing_documents%rowtype;
  target_organization uuid;
  target_agency uuid;
  publish_event uuid;
begin
  if p_idempotency_key is not null then
    select de.resource_id into publish_event
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.document.published'
      and de.idempotency_key = p_idempotency_key;
    if publish_event is not null then return p_document_id; end if;
  end if;

  select * into target_doc from public.billing_documents where id = p_document_id for update;
  if target_doc.id is null then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target_doc.status = 'draft' then raise exception using errcode = 'P0001', message = 'cannot_publish_draft'; end if;
  if target_doc.published_to_client then return p_document_id; end if;

  select o.id, o.agency_id into target_organization, target_agency
  from public.organizations o where o.id = target_doc.organization_id;

  if not public.is_internal_actor() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if target_doc.project_id is not null and not public.project_access_allowed(target_doc.project_id, 'billing.publish') then
    if not public.has_capability('billing.publish', target_agency, target_organization) then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  elsif target_doc.project_id is null and not public.has_capability('billing.publish', target_agency, target_organization) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  update public.billing_documents
  set published_to_client = true,
      published_at = now()
  where id = p_document_id;

  perform app_private.emit_event(
    'billing.document.published', actor, 'billing_document', p_document_id,
    target_agency, target_organization, p_document_id, p_idempotency_key, '{}'::jsonb
  );

  return p_document_id;
end;
$$;

-- View for client portal projection
create view public.client_billing_projections as
select
  bd.id,
  bd.number,
  bd.type,
  bd.status,
  bd.organization_id,
  bd.brand_id,
  bd.project_id,
  bd.date,
  bd.due_date,
  bd.currency,
  bd.total_amount,
  bd.published_at,
  coalesce(
    (select sum(amount) from public.payment_records pr where pr.billing_document_id = bd.id and pr.voided_at is null),
    0
  ) as total_paid
from public.billing_documents bd
where bd.published_to_client = true
  and (
    -- Access through project
    (bd.project_id is not null and exists (
      select 1 from public.project_memberships pm
      where pm.project_id = bd.project_id and pm.user_id = (select auth.uid()) and pm.status = 'active'
    ))
    or
    -- Access through organization
    exists (
      select 1 from public.client_memberships cm
      where cm.organization_id = bd.organization_id and cm.user_id = (select auth.uid()) and cm.status = 'active'
    )
  );

grant select on public.client_billing_projections to authenticated;

-- Function Grants
grant execute on function public.issue_billing_document(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_payment(uuid, numeric, public.payment_method, timestamptz, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.void_payment(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.publish_billing_document(uuid, uuid) to authenticated, service_role;
