-- Phase 15: least privilege, financial scope, mutation integrity and policy consolidation.
-- Policies preserve authorized draft/view paths; project assignment never falls back to org scope.
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema app_private revoke execute on functions from public,anon,authenticated;

create function app_private.billing_scope(p_organization uuid,p_project uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations o join public.agency_memberships am
  on am.agency_id=o.agency_id and am.user_id=(select auth.uid()) and am.status='active'
  where o.id=p_organization and public.has_capability(p_capability,o.agency_id,o.id)
  and (p_project is null or exists(select 1 from public.projects p join public.brands b on b.id=p.brand_id
   where p.id=p_project and b.organization_id=o.id and public.project_access_allowed(p.id,p_capability))));
$$;
revoke all on function app_private.billing_scope(uuid,uuid,text) from public,anon;
grant execute on function app_private.billing_scope(uuid,uuid,text) to authenticated;

create function app_private.billing_document_access(p_document uuid,p_capability text,p_draft boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_documents d where d.id=p_document
  and (not p_draft or d.status='draft') and app_private.billing_scope(d.organization_id,d.project_id,p_capability));
$$;
revoke all on function app_private.billing_document_access(uuid,text,boolean) from public,anon;
grant execute on function app_private.billing_document_access(uuid,text,boolean) to authenticated;

create function app_private.assert_billing_command(p_document uuid,p_capability text,p_key uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.billing_document_access(p_document,p_capability) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if p_key is null then raise exception using errcode='22023',message='idempotency_required'; end if;
 -- Serialize equal actor/command/key across documents before replay validation.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_capability||p_key::text,0));
end;$$;
revoke all on function app_private.assert_billing_command(uuid,text,uuid) from public,anon,authenticated;

revoke all on public.billing_documents,public.billing_document_items,public.billing_document_files,
 public.payment_schedules,public.payment_records from anon,authenticated;
grant select on public.billing_documents,public.billing_document_items,public.billing_document_files,
 public.payment_schedules,public.payment_records to authenticated;
grant insert(type,status,organization_id,brand_id,project_id,opportunity_id,date,due_date,currency,subtotal_amount,tax_amount,total_amount,notes)
 on public.billing_documents to authenticated;
grant update(type,organization_id,brand_id,project_id,opportunity_id,date,due_date,currency,subtotal_amount,tax_amount,total_amount,notes)
 on public.billing_documents to authenticated;
grant insert,update,delete on public.billing_document_items,public.billing_document_files,public.payment_schedules to authenticated;
alter table public.billing_documents force row level security;
alter table public.billing_document_items force row level security;
alter table public.billing_document_files force row level security;
alter table public.payment_schedules force row level security;
alter table public.payment_records force row level security;
drop policy "Actors can view files of viewable documents" on public.billing_document_files;
drop policy "Actors with capability can manage draft document files" on public.billing_document_files;
drop policy "Actors can view items of viewable documents" on public.billing_document_items;
drop policy "Actors with capability can manage draft document items" on public.billing_document_items;
drop policy "Actors with capability can create draft billing documents" on public.billing_documents;
drop policy "Actors with capability can update draft billing documents" on public.billing_documents;
drop policy "Internal actors with capability can view billing documents" on public.billing_documents;
drop policy "Actors can view payments of viewable documents" on public.payment_records;
drop policy "Actors can view schedules of viewable documents" on public.payment_schedules;
drop policy "Actors with capability can manage draft schedules" on public.payment_schedules;
create policy billing_documents_read on public.billing_documents for select to authenticated
 using(app_private.billing_scope(organization_id,project_id,'billing.view') or
 (status='draft' and app_private.billing_scope(organization_id,project_id,'billing.create')));
create policy billing_documents_insert on public.billing_documents for insert to authenticated
 with check(status='draft' and number is null and not published_to_client and published_at is null
 and issued_at is null and issued_by is null and cancelled_at is null and cancelled_by is null and archived_at is null
 and app_private.billing_scope(organization_id,project_id,'billing.create'));
create policy billing_documents_update on public.billing_documents for update to authenticated
 using(status='draft' and app_private.billing_scope(organization_id,project_id,'billing.create'))
 with check(status='draft' and number is null and not published_to_client and published_at is null
 and issued_at is null and issued_by is null and cancelled_at is null and cancelled_by is null and archived_at is null
 and app_private.billing_scope(organization_id,project_id,'billing.create'));
create policy payment_records_read on public.payment_records for select to authenticated
 using(app_private.billing_document_access(billing_document_id,'billing.view'));
create policy billing_document_items_read on public.billing_document_items for select to authenticated
 using(app_private.billing_document_access(billing_document_id,'billing.view') or app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_items_insert on public.billing_document_items for insert to authenticated with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_items_update on public.billing_document_items for update to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true)) with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_items_delete on public.billing_document_items for delete to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy payment_schedules_read on public.payment_schedules for select to authenticated
 using(app_private.billing_document_access(billing_document_id,'billing.view') or app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy payment_schedules_insert on public.payment_schedules for insert to authenticated with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy payment_schedules_update on public.payment_schedules for update to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true)) with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy payment_schedules_delete on public.payment_schedules for delete to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_files_read on public.billing_document_files for select to authenticated
 using(app_private.billing_document_access(billing_document_id,'billing.view') or app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_files_insert on public.billing_document_files for insert to authenticated with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_files_update on public.billing_document_files for update to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true)) with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy billing_document_files_delete on public.billing_document_files for delete to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true));
create function app_private.validate_billing_relations() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.brand_id is not null and not exists(select 1 from public.brands b where b.id=new.brand_id and b.organization_id=new.organization_id)
 or new.project_id is not null and not exists(select 1 from public.projects p join public.brands b on b.id=p.brand_id
  where p.id=new.project_id and b.organization_id=new.organization_id and (new.brand_id is null or new.brand_id=b.id))
 or new.opportunity_id is not null and not exists(select 1 from public.opportunities o where o.id=new.opportunity_id and o.organization_id=new.organization_id)
 then raise exception using errcode='23514',message='billing_scope_mismatch'; end if;
 return new;
end;$$;
revoke all on function app_private.validate_billing_relations() from public,anon,authenticated;
create trigger billing_relations before insert or update on public.billing_documents for each row execute function app_private.validate_billing_relations();
CREATE OR REPLACE FUNCTION public.has_capability(capability_key text, agency_scope uuid DEFAULT NULL::uuid, organization_scope uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.agency_memberships as am
    join public.role_capabilities as rc on rc.role_key = am.role_key
    where am.user_id = (select auth.uid())
      and am.status = 'active'
      and rc.capability_key = $1
      and ($2 is null or am.agency_id = $2)

    union all

    select 1
    from public.capability_grants as cg
    where cg.user_id = (select auth.uid())
      and cg.capability_key = $1
      and exists(select 1 from public.agency_memberships active_member where active_member.user_id=cg.user_id
      and active_member.agency_id=cg.agency_id and active_member.status='active')
      and cg.revoked_at is null
      and (cg.expires_at is null or cg.expires_at > now())
      and ($2 is null or cg.agency_id = $2)
      and (
        (cg.scope_kind = 'agency' and $3 is null)
        or (cg.scope_kind = 'agency' and $3 is not null)
        or (cg.scope_kind = 'organization' and cg.organization_id = $3)
      )

    union all

    select 1
    from public.client_memberships as cm
    join public.role_capabilities as rc on rc.role_key = cm.role_key
    where cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and rc.capability_key = $1
      and $3 is not null
      and cm.organization_id = $3
  );
$function$
;
CREATE OR REPLACE FUNCTION public.issue_billing_document(p_document_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform app_private.assert_billing_command(p_document_id,'billing.issue',p_idempotency_key);
  if p_idempotency_key is not null then
    select de.resource_id into created_event
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.document.issued'
      and de.idempotency_key = p_idempotency_key;
    if created_event is not null then
      if created_event<>p_document_id then raise exception using errcode='22023',message='idempotency_conflict'; end if;
      return created_event; end if;
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
$function$
;
revoke all on function public.issue_billing_document(p_document_id uuid, p_idempotency_key uuid) from public,anon;
CREATE OR REPLACE FUNCTION public.publish_billing_document(p_document_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  target_doc public.billing_documents%rowtype;
  target_organization uuid;
  target_agency uuid;
  publish_event uuid;
begin
  perform app_private.assert_billing_command(p_document_id,'billing.publish',p_idempotency_key);
  if p_idempotency_key is not null then
    select de.resource_id into publish_event
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.document.published'
      and de.idempotency_key = p_idempotency_key;
    if publish_event is not null then
      if publish_event<>p_document_id then raise exception using errcode='22023',message='idempotency_conflict'; end if;
      return p_document_id; end if;
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
$function$
;
revoke all on function public.publish_billing_document(p_document_id uuid, p_idempotency_key uuid) from public,anon;
CREATE OR REPLACE FUNCTION public.record_payment(p_document_id uuid, p_amount numeric, p_method payment_method, p_received_at timestamp with time zone, p_reference text, p_notes text, p_file_asset_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  target_doc public.billing_documents%rowtype;
  target_organization uuid;
  target_agency uuid;
  payment_id uuid;
  paid_amount numeric(14,2);
  new_status public.billing_document_status;
begin
  perform app_private.assert_billing_command(p_document_id,'billing.record_payment',p_idempotency_key);
  if p_idempotency_key is not null then
    select de.resource_id into payment_id
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.payment.recorded'
      and de.idempotency_key = p_idempotency_key;
    if payment_id is not null then
      if not exists(select 1 from public.payment_records where id=payment_id and billing_document_id=p_document_id
       and amount=p_amount and method=p_method and received_at=p_received_at and reference is not distinct from p_reference
       and notes is not distinct from p_notes and file_asset_id is not distinct from p_file_asset_id)
      then raise exception using errcode='22023',message='idempotency_conflict'; end if;
      return payment_id; end if;
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

  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or p_amount <= 0 then raise exception using errcode = '23514', message = 'invalid_amount'; end if;

  if p_file_asset_id is not null and not exists(select 1 from public.file_assets f
    join public.projects p on p.id=f.project_id join public.brands b on b.id=p.brand_id where f.id=p_file_asset_id
    and f.status='ready' and b.organization_id=target_doc.organization_id
    and (target_doc.project_id is null or f.project_id=target_doc.project_id) and public.project_access_allowed(f.project_id,'file.view'))
    then raise exception using errcode='42501',message='forbidden'; end if;
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
$function$
;
revoke all on function public.record_payment(p_document_id uuid, p_amount numeric, p_method payment_method, p_received_at timestamp with time zone, p_reference text, p_notes text, p_file_asset_id uuid, p_idempotency_key uuid) from public,anon;
CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform app_private.assert_billing_command((select billing_document_id from public.payment_records where id=p_payment_id),'billing.void_payment',p_idempotency_key);
  if p_idempotency_key is not null then
    select de.resource_id into void_event
    from public.domain_events as de
    where de.actor_id = actor
      and de.event_type = 'billing.payment.voided'
      and de.idempotency_key = p_idempotency_key;
    if void_event is not null then
      if void_event<>p_payment_id then raise exception using errcode='22023',message='idempotency_conflict'; end if;
      return p_payment_id; end if;
  end if;

  perform 1 from public.billing_documents where id=(select billing_document_id from public.payment_records where id=p_payment_id) for update;
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
$function$
;
revoke all on function public.void_payment(p_payment_id uuid, p_reason text, p_idempotency_key uuid) from public,anon;
revoke all on function app_private.freeze_issued_billing_document(),app_private.freeze_issued_billing_document_items() from public,anon,authenticated;
-- Ready for versioned keys; encryption/decryption remains exclusively in the Edge runtime.
CREATE OR REPLACE FUNCTION public.phase13_store_credentials(p_connection uuid, p_actor uuid, p_url text, p_cipher jsonb, p_key uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.integration_connections%rowtype;
begin
 select * into v from public.integration_connections where id=p_connection for update;
 if v.id is null or not app_private.p13_permission(v.project_id,p_actor,'integration.manage') then
  raise exception using errcode='42501',message='integration_forbidden'; end if;
 if p_key is null then raise exception using errcode='22023',message='invalid_connection'; end if;
 if v.last_config_key=p_key then return; end if;
 if p_url is null or char_length(p_url)>2048 or p_cipher is null or jsonb_typeof(p_cipher)<>'object'
  or p_cipher->>'algorithm' is distinct from 'AES-GCM' or coalesce(p_cipher->>'key_version','') !~ '^[1-9][0-9]{0,3}$'
  or not(p_cipher ?& array['iv','ciphertext']) then
  raise exception using errcode='22023',message='invalid_credentials_envelope'; end if;
 insert into app_private.integration_credentials(connection_id,endpoint_url,encrypted_secret) values(v.id,p_url,p_cipher)
 on conflict(connection_id) do update set endpoint_url=excluded.endpoint_url,encrypted_secret=excluded.encrypted_secret,updated_at=now();
 update public.integration_connections set status='active',credentials_version=credentials_version+1,
  consented_by=p_actor,consented_at=now(),updated_at=now(),last_config_key=p_key where id=v.id;
 perform app_private.p13_audit('integration.secret.changed',p_actor,'integration_connection',v.id,v.project_id,
  jsonb_build_object('credentials_version',v.credentials_version+1));
end; $function$
;

-- 2000-row synthetic Billing EXPLAIN: ordered page 1710.278ms -> 28.490ms.
-- Prevent sorting/authorizing the complete history before a bounded page.
create index billing_documents_created_id_idx on public.billing_documents(created_at desc,id desc);
revoke all on function app_private.client_project_access(uuid,uuid),app_private.client_asset_access(uuid,uuid),app_private.client_reviewer_access(uuid,uuid) from public,anon;
grant execute on function app_private.client_project_access(uuid,uuid),app_private.client_asset_access(uuid,uuid),app_private.client_reviewer_access(uuid,uuid) to authenticated;
