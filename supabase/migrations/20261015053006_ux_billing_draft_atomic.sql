begin;

create or replace function public.create_billing_draft(p_key uuid,p_organization uuid,p_project uuid,p_type public.billing_document_type,p_date date,p_currency text,p_concept text,p_subtotal numeric,p_tax numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.billing_documents; actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if not app_private.billing_scope(p_organization,p_project,'billing.create') then raise exception using errcode='42501',message='forbidden'; end if;
  if p_key is null or p_type is null or p_date is null or p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_concept is null or char_length(trim(p_concept)) not between 1 and 1000
    or p_subtotal is null or p_tax is null or p_subtotal<0 or p_tax<0 or round(p_subtotal,2)<>p_subtotal or round(p_tax,2)<>p_tax then
    raise exception using errcode='22023',message='invalid_billing_draft';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,0));
  select * into existing from public.billing_documents where id=p_key and created_by=actor;
  if existing.id is not null then
    if existing.created_by is distinct from actor or existing.organization_id is distinct from p_organization or existing.project_id is distinct from p_project
      or existing.type is distinct from p_type or existing.date is distinct from p_date or existing.currency is distinct from p_currency
      or existing.subtotal_amount is distinct from p_subtotal or existing.tax_amount is distinct from p_tax
      or not exists(select 1 from public.billing_document_items where billing_document_id=p_key and description=trim(p_concept) and quantity=1 and unit_price=p_subtotal)
    then raise exception using errcode='22023',message='billing_draft_retry_conflict'; end if;
    return existing.id;
  end if;
  insert into public.billing_documents(id,organization_id,project_id,type,date,currency,subtotal_amount,tax_amount,total_amount,created_by)
    values(p_key,p_organization,p_project,p_type,p_date,p_currency,p_subtotal,p_tax,p_subtotal+p_tax,actor);
  insert into public.billing_document_items(billing_document_id,description,quantity,unit_price,line_total)
    values(p_key,trim(p_concept),1,p_subtotal,p_subtotal);
  return p_key;
end $$;
revoke all on function public.create_billing_draft(uuid,uuid,uuid,public.billing_document_type,date,text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.create_billing_draft(uuid,uuid,uuid,public.billing_document_type,date,text,text,numeric,numeric) to authenticated;

commit;
