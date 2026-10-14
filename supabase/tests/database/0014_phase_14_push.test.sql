begin;
select no_plan();
select has_table('app_private','push_subscriptions','subscriptions are private');
select has_table('app_private','push_delivery_outbox','delivery channel outbox exists');
select ok(not has_table_privilege('authenticated','app_private.push_subscriptions','select'),'no browser secret listing');
select ok(not has_table_privilege('authenticated','app_private.push_subscriptions','insert'),'no direct subscription mutation');
select ok(not has_table_privilege('service_role','app_private.push_delivery_outbox','update'),'worker must use fenced commands');
select ok(not has_function_privilege('anon','public.register_push_subscription(jsonb,text)','execute'),'anonymous registration denied');
select ok(not has_function_privilege('authenticated','public.push_claim_delivery()','execute'),'browser cannot claim');
select ok(not has_function_privilege('authenticated','public.push_delivery_material(uuid,uuid)','execute'),'browser cannot fetch worker secrets');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('14000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005',now(),now()),
 ('14000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000007',now(),now());
insert into public.domain_events(event_id,event_type,resource_type,resource_id)
values('14000000-0000-0000-0000-000000000010','message.sent','message',gen_random_uuid());
insert into public.domain_events(event_id,event_type,resource_type,resource_id)
values('14000000-0000-0000-0000-000000000011','message.sent','message',gen_random_uuid());
insert into public.messages(id,channel_id,author_user_id,client_message_id,body)
select '14000000-0000-0000-0000-000000000012',id,'10000000-0000-0000-0000-000000000001',gen_random_uuid(),'pgTAP push fixture'
from public.channels where organization_id='30000000-0000-0000-0000-00000000000a' and kind='organization';
select set_config('test.push_subscription',jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/phase14_database',
 'device_token','14000000-0000-0000-0000-000000000014',
 'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('a',22)))::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","session_id":"14000000-0000-0000-0000-000000000001"}',true);
select set_config('test.push_id',public.register_push_subscription(current_setting('test.push_subscription')::jsonb,'portal')::text,true);
select is(public.register_push_subscription(current_setting('test.push_subscription')::jsonb,'portal'),current_setting('test.push_id')::uuid,'register is idempotent');
select ok(public.push_subscription_status('https://fcm.googleapis.com/fcm/send/phase14_database','14000000-0000-0000-0000-000000000014'),'own device status');
select throws_ok($$select public.register_push_subscription(current_setting('test.push_subscription')::jsonb || '{"user_id":"10000000-0000-0000-0000-000000000007"}','portal')$$,
 '22023','invalid_subscription','forged recipient denied');
select throws_ok($$select public.register_push_subscription(jsonb_set(current_setting('test.push_subscription')::jsonb,'{endpoint}','"https://127.0.0.1/private"'),'portal')$$,
 '22023','invalid_subscription','SSRF endpoint denied');
select throws_ok($$select public.register_push_subscription(current_setting('test.push_subscription')::jsonb,'app')$$,
 '42501','surface_forbidden','client cannot bind to internal surface');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated","session_id":"14000000-0000-0000-0000-000000000002"}',true);
select throws_ok($$select public.register_push_subscription(current_setting('test.push_subscription')::jsonb,'portal')$$,
 '42501','endpoint_owned','active foreign endpoint takeover denied');
select is(public.push_subscription_status('https://fcm.googleapis.com/fcm/send/phase14_database'),false,'foreign status reveals no association');
select lives_ok($$select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/phase14_database')$$,'foreign unregister is harmless');
reset role;
select ok((select active from app_private.push_subscriptions where id=current_setting('test.push_id')::uuid),'foreign unregister did not deactivate A');
insert into public.notifications(recipient_id,domain_event_id,kind,channel_id,message_id)
 select '10000000-0000-0000-0000-000000000005','14000000-0000-0000-0000-000000000010','message_received',channel_id,id
 from public.messages where id='14000000-0000-0000-0000-000000000012';
select set_config('test.push_notification',(select notification_id from app_private.push_delivery_outbox where subscription_id=current_setting('test.push_id')::uuid)::text,true);
select is((select count(*) from app_private.push_delivery_outbox),1::bigint,'one logical delivery for recipient device');
insert into app_private.push_delivery_outbox(notification_id,subscription_id,generation)
 values(current_setting('test.push_notification')::uuid,current_setting('test.push_id')::uuid,1) on conflict do nothing;
select is((select count(*) from app_private.push_delivery_outbox),1::bigint,'duplicate intent deduplicated');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.push_claim',public.push_claim_delivery()::text,true);
select is(public.push_claim_delivery(),null::jsonb,'second worker cannot claim leased delivery');
select is((select array_agg(key order by key) from jsonb_object_keys(public.push_delivery_material(
 (current_setting('test.push_claim')::jsonb->>'id')::uuid,(current_setting('test.push_claim')::jsonb->>'token')::uuid)->'payload') key),
 array['device_token','endpoint_hash','notification_id','surface'],'safe minimal payload, no message/body/client data');
select throws_ok($$select public.push_delivery_material((current_setting('test.push_claim')::jsonb->>'id')::uuid,gen_random_uuid())$$,
 '42501','stale_claim','wrong fencing token rejected');
select ok(public.push_finish_delivery((current_setting('test.push_claim')::jsonb->>'id')::uuid,
 (current_setting('test.push_claim')::jsonb->>'token')::uuid,429),'temporary failure recorded');
reset role;
select is((select status from app_private.push_delivery_outbox),'pending','retry returns to pending');
select ok((select available_at>now() from app_private.push_delivery_outbox),'backoff is future bounded delay');
update app_private.push_delivery_outbox set available_at=now();
set local role service_role;
select set_config('test.push_claim',public.push_claim_delivery()::text,true);
select ok(public.push_finish_delivery((current_setting('test.push_claim')::jsonb->>'id')::uuid,
 (current_setting('test.push_claim')::jsonb->>'token')::uuid,410),'410 recorded');
reset role;
select is((select status from app_private.push_delivery_outbox),'failed','invalid endpoint terminal');
select is((select active from app_private.push_subscriptions),false,'410 deactivates subscription');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","session_id":"14000000-0000-0000-0000-000000000001"}',true);
select lives_ok($$select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/phase14_database')$$,'unregister idempotent');
select lives_ok($$select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/phase14_database')$$,'repeated unregister idempotent');
select is((select push_enabled from public.notification_preferences where user_id=auth.uid()),false,'last device disable clears push preference');
select lives_ok($$select public.register_push_subscription(current_setting('test.push_subscription')::jsonb,'portal')$$,'explicit reenable');
reset role;
select is((select generation from app_private.push_subscriptions),2,'reactivation bumps generation');
update public.notification_preferences set push_enabled=false where user_id='10000000-0000-0000-0000-000000000005';
insert into public.notifications(recipient_id,domain_event_id,kind,channel_id,message_id)
 select '10000000-0000-0000-0000-000000000005','14000000-0000-0000-0000-000000000011','message_received',channel_id,id
 from public.messages where id='14000000-0000-0000-0000-000000000012';
select is((select count(*) from app_private.push_delivery_outbox),1::bigint,'disabled preferences prevent future intent');
delete from auth.sessions where id='14000000-0000-0000-0000-000000000001';
select is((select count(*) from app_private.push_subscriptions),0::bigint,'expired/deleted session drops device association');
set local role authenticated;
select throws_ok($$select public.register_push_subscription(current_setting('test.push_subscription')::jsonb,'portal')$$,
 '42501','unauthorized','stale session cannot register');
reset role;
select * from finish();
rollback;
