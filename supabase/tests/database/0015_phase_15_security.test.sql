begin;
select no_plan();
-- Catalog properties are tested against the reconstructed database, not source text.
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),0::bigint,'all exposed tables have RLS');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v' and has_table_privilege('authenticated',c.oid,'select')
 and not coalesce(c.reloptions @> array['security_invoker=true'],false)),0::bigint,'exposed views are invoker');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private') and p.prosecdef
 and not coalesce(p.proconfig @> array['search_path=""'] or p.proconfig @> array['search_path='],false)),0::bigint,'all definers have fixed empty search_path');
select ok(not has_function_privilege('anon','public.issue_billing_document(uuid,uuid)','execute'),'anon cannot invoke issue');
select ok(not has_function_privilege('anon','public.publish_billing_document(uuid,uuid)','execute'),'anon cannot invoke publish');
select ok(not has_function_privilege('anon','public.record_payment(uuid,numeric,public.payment_method,timestamptz,text,text,uuid,uuid)','execute'),'anon cannot invoke payment');
select ok(not has_function_privilege('authenticated','public.phase13_claim_run(uuid)','execute'),'users cannot claim automation worker');
select ok(not has_function_privilege('authenticated','public.push_claim_delivery()','execute'),'users cannot claim Push worker');
select ok(not has_table_privilege('authenticated','app_private.integration_credentials','select'),'credentials inaccessible');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private') and p.proname<>'health_check' and has_function_privilege('anon',p.oid,'execute')),0::bigint,'anon has no application function except health_check');
select is((select count(*) from pg_policies where schemaname='public' and tablename in
 ('billing_document_items','payment_schedules','billing_document_files') and cmd in ('SELECT','ALL')),3::bigint,'one read policy per Billing child');

insert into public.capability_grants(user_id,agency_id,capability_key,scope_kind,organization_id,reason)
 select '10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',key,'organization',
 '30000000-0000-0000-0000-00000000000a','Phase15 adversarial fixture' from public.capabilities where key like 'billing.%'
 on conflict do nothing;
insert into public.billing_documents(id,organization_id,project_id,subtotal_amount,total_amount) values
 ('15000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000000a1',100,100),
 ('15000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000000a3',100,100);
insert into public.billing_document_items(billing_document_id,description,unit_price,line_total)
 values('15000000-0000-0000-0000-000000000001','QA',100,100);
insert into public.file_assets(id,project_id,object_path,original_filename,mime_type,size_bytes,uploaded_by,status,finalized_at) values
 ('15000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-0000000000a1','60000000-0000-0000-0000-0000000000a1/15000000-0000-0000-0000-000000000004','qa.pdf','application/pdf',100,'10000000-0000-0000-0000-000000000001','ready',now()),
 ('15000000-0000-0000-0000-000000000005','60000000-0000-0000-0000-0000000000b1','60000000-0000-0000-0000-0000000000b1/15000000-0000-0000-0000-000000000005','foreign.pdf','application/pdf',100,'10000000-0000-0000-0000-000000000001','ready',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.billing_documents where id='15000000-0000-0000-0000-000000000001'),1::bigint,'PM explicit capability and Project membership allows A1');
select is((select count(*) from public.billing_documents where id='15000000-0000-0000-0000-000000000002'),0::bigint,'Organization capability cannot bypass A3 assignment');
select throws_ok($$select public.issue_billing_document('15000000-0000-0000-0000-000000000002',gen_random_uuid())$$,'42501','forbidden','PM cannot issue foreign Project');
select throws_ok($$update public.billing_documents set status='issued' where id='15000000-0000-0000-0000-000000000001'$$,'42501',null,'direct status escalation denied');
select throws_ok($$update public.billing_documents set published_to_client=true where id='15000000-0000-0000-0000-000000000001'$$,'42501',null,'direct publication denied');
select throws_ok($$update public.billing_documents set number='FORGED' where id='15000000-0000-0000-0000-000000000001'$$,'42501',null,'direct numbering denied');
select throws_ok($$insert into public.billing_documents(organization_id,project_id,status,number) values
 ('30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000000a1','issued','FORGED')$$,'42501',null,'insert cannot forge issue metadata');
select throws_ok($$select public.issue_billing_document('15000000-0000-0000-0000-000000000001',null)$$,'22023','idempotency_required','commands require idempotency');
select lives_ok($$select public.issue_billing_document('15000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003')$$,'authoritative issue succeeds');
select lives_ok($$select public.issue_billing_document('15000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003')$$,'issue replay succeeds');
select throws_ok($$select public.record_payment('15000000-0000-0000-0000-000000000001',0.001,'transfer',now(),null,null,null,gen_random_uuid())$$,'23514','invalid_amount','sub-cent precision denied');
select throws_ok($$select public.record_payment('15000000-0000-0000-0000-000000000001','NaN'::numeric,'transfer',now(),null,null,null,gen_random_uuid())$$,'23514','invalid_amount','NaN payment denied');
select throws_ok($$select public.record_payment('15000000-0000-0000-0000-000000000001',101,'transfer',now(),null,null,null,gen_random_uuid())$$,'23514','overpayment_rejected','overpayment denied');
select throws_ok($$select public.record_payment('15000000-0000-0000-0000-000000000001',1,'transfer',now(),null,null,'15000000-0000-0000-0000-000000000005',gen_random_uuid())$$,'42501','forbidden','foreign Project payment file denied');
select lives_ok($$select public.record_payment('15000000-0000-0000-0000-000000000001',1,'transfer',now(),null,null,'15000000-0000-0000-0000-000000000004',gen_random_uuid())$$,'same Project ready file uses existing file.view capability');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.billing_documents),0::bigint,'client sees no internal financial rows');
select is((select count(*) from public.client_billing_projections where id='15000000-0000-0000-0000-000000000001'),0::bigint,'client cannot see unpublished issued document');
select throws_ok($$select public.issue_billing_document('15000000-0000-0000-0000-000000000001',gen_random_uuid())$$,'42501','forbidden','client direct RPC denied before state oracle');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.billing_documents),0::bigint,'founder contributor gains no financial authority');
reset role;
update public.capability_grants set expires_at=now()-interval '1 second',created_at=now()-interval '2 seconds'
 where user_id='10000000-0000-0000-0000-000000000003' and capability_key='billing.issue';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.issue_billing_document('15000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003')$$,'42501','forbidden','expired capability blocks replay');
reset role;
update public.capability_grants set revoked_at=now() where user_id='10000000-0000-0000-0000-000000000003' and capability_key='billing.view';
set local role authenticated;
select is((select count(*) from public.billing_documents where id='15000000-0000-0000-0000-000000000001'),0::bigint,'revoked read capability denies issued document in existing session');
reset role;
update public.agency_memberships set status='suspended' where user_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select ok(not public.has_capability('billing.create','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a'),'suspended membership invalidates explicit grants');
reset role;
select throws_ok($$insert into public.billing_documents(organization_id,project_id) values('30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000000b1')$$,'23514','billing_scope_mismatch','project and organization must agree even in privileged commands');
select * from finish();
rollback;
