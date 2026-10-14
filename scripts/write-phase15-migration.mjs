// Generates explicit new DDL from the audited baseline; never changes history.
import { readFileSync, writeFileSync } from 'node:fs'
const {functions}=JSON.parse(readFileSync('artifacts/phase-15/database-inventory-before.json','utf8'))
const definition=name=>functions.find(f=>f.schema==='public'&&f.proname===name).definition
let sql=`-- Phase 15: least privilege, financial scope, mutation integrity and policy consolidation.
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
`
const inventory=JSON.parse(readFileSync('artifacts/phase-15/database-inventory-before.json','utf8'))
for(const policy of inventory.policies.filter(p=>['billing_documents','billing_document_items','billing_document_files','payment_schedules','payment_records'].includes(p.tablename))) {
 sql+=`drop policy ${JSON.stringify(policy.policyname)} on public.${policy.tablename};\n`
}
sql+=`create policy billing_documents_read on public.billing_documents for select to authenticated
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
`
for(const table of ['billing_document_items','payment_schedules','billing_document_files']) {
 sql+=`create policy ${table}_read on public.${table} for select to authenticated
 using(app_private.billing_document_access(billing_document_id,'billing.view') or app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy ${table}_insert on public.${table} for insert to authenticated with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy ${table}_update on public.${table} for update to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true)) with check(app_private.billing_document_access(billing_document_id,'billing.create',true));
create policy ${table}_delete on public.${table} for delete to authenticated using(app_private.billing_document_access(billing_document_id,'billing.create',true));
`
}
sql+=`create function app_private.validate_billing_relations() returns trigger language plpgsql security definer set search_path='' as $$
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
`
// Capability grants must stop authorizing immediately when their agency membership is disabled.
sql+=definition('has_capability').replace('and cg.revoked_at is null',`and exists(select 1 from public.agency_memberships active_member where active_member.user_id=cg.user_id
      and active_member.agency_id=cg.agency_id and active_member.status='active')
      and cg.revoked_at is null`)+';\n'
for(const [name,capability] of [['issue_billing_document','billing.issue'],['publish_billing_document','billing.publish'],['record_payment','billing.record_payment'],['void_payment','billing.void_payment']]) {
 let text=definition(name)
 const target=name==='void_payment'?'(select billing_document_id from public.payment_records where id=p_payment_id)':'p_document_id'
 text=text.replace(/\nbegin\r?\n/,`\nbegin\n  perform app_private.assert_billing_command(${target},'${capability}',p_idempotency_key);\n`)
 if(name==='issue_billing_document')text=text.replace('if created_event is not null then return created_event; end if;',"if created_event is not null then\n      if created_event<>p_document_id then raise exception using errcode='22023',message='idempotency_conflict'; end if;\n      return created_event; end if;")
 if(name==='publish_billing_document')text=text.replace('if publish_event is not null then return p_document_id; end if;',"if publish_event is not null then\n      if publish_event<>p_document_id then raise exception using errcode='22023',message='idempotency_conflict'; end if;\n      return p_document_id; end if;")
 if(name==='record_payment') {
   text=text.replace('if payment_id is not null then return payment_id; end if;',`if payment_id is not null then
      if not exists(select 1 from public.payment_records where id=payment_id and billing_document_id=p_document_id
       and amount=p_amount and method=p_method and received_at=p_received_at and reference is not distinct from p_reference
       and notes is not distinct from p_notes and file_asset_id is not distinct from p_file_asset_id)
      then raise exception using errcode='22023',message='idempotency_conflict'; end if;
      return payment_id; end if;`)
   text=text.replace("if p_amount <= 0 then", "if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or p_amount <= 0 then")
   text=text.replace('  -- Overpayment validation',`  if p_file_asset_id is not null and not exists(select 1 from public.file_assets f
    join public.projects p on p.id=f.project_id join public.brands b on b.id=p.brand_id where f.id=p_file_asset_id
    and f.status='ready' and b.organization_id=target_doc.organization_id
    and (target_doc.project_id is null or f.project_id=target_doc.project_id) and public.project_access_allowed(f.project_id,'file.view'))
    then raise exception using errcode='42501',message='forbidden'; end if;
  -- Overpayment validation`)
 }
 if(name==='void_payment') {
   text=text.replace('if void_event is not null then return p_payment_id; end if;',"if void_event is not null then\n      if void_event<>p_payment_id then raise exception using errcode='22023',message='idempotency_conflict'; end if;\n      return p_payment_id; end if;")
   // Consistent document -> payment lock order also used by record_payment.
   text=text.replace('  select * into target_payment from public.payment_records where id = p_payment_id for update;',`  perform 1 from public.billing_documents where id=(select billing_document_id from public.payment_records where id=p_payment_id) for update;
  select * into target_payment from public.payment_records where id = p_payment_id for update;`)
 }
 sql+=text+';\n'
 const identity=functions.find(f=>f.schema==='public'&&f.proname===name).arguments
 sql+=`revoke all on function public.${name}(${identity}) from public,anon;\n`
}
sql+=`revoke all on function app_private.freeze_issued_billing_document(),app_private.freeze_issued_billing_document_items() from public,anon,authenticated;
-- Ready for versioned keys; encryption/decryption remains exclusively in the Edge runtime.
`
// Versioned envelope validation; retain the existing private write-only service boundary.
const store=definition('phase13_store_credentials').replace("p_cipher->>'key_version' is distinct from '1'",()=>"coalesce(p_cipher->>'key_version','') !~ '^[1-9][0-9]{0,3}$'")
sql+=store+';\n'
sql+=`\n-- 2000-row synthetic Billing EXPLAIN: ordered page 1710.278ms -> 28.490ms.
-- Prevent sorting/authorizing the complete history before a bounded page.
create index billing_documents_created_id_idx on public.billing_documents(created_at desc,id desc);\n`
sql+=`revoke all on function app_private.client_project_access(uuid,uuid),app_private.client_asset_access(uuid,uuid),app_private.client_reviewer_access(uuid,uuid) from public,anon;
grant execute on function app_private.client_project_access(uuid,uuid),app_private.client_asset_access(uuid,uuid),app_private.client_reviewer_access(uuid,uuid) to authenticated;\n`
writeFileSync('supabase/migrations/20261014052637_phase_15_security_performance.sql',sql)
console.log('Wrote explicit Phase 15 migration from audited final definitions.')
