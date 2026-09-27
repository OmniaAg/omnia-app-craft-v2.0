begin;
select no_plan();

select has_table('public','channels','channels persist');
select has_table('public','channel_memberships','channel membership persists');
select has_table('public','messages','messages persist');
select has_table('public','notification_preferences','preferences persist');
select has_table('public','notification_outbox','notification delivery intents persist');
select is((select count(*) from public.channels where kind='organization'),2::bigint,
 'one general channel exists for each seeded client organization');
insert into public.client_memberships(user_id,organization_id,role_key,status)
values('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-00000000000a','client_viewer','active');
select is((select count(*) from public.channel_memberships m join public.channels c on c.id=m.channel_id
 where c.kind='organization' and c.organization_id='30000000-0000-0000-0000-00000000000a'
 and m.user_id='10000000-0000-0000-0000-000000000002' and m.status='active'),1::bigint,
 'new active client member automatically joins general channel');
update public.client_memberships set status='suspended'
 where user_id='10000000-0000-0000-0000-000000000002' and organization_id='30000000-0000-0000-0000-00000000000a';
select ok(not app_private.channel_access((select id from public.channels where kind='organization'
 and organization_id='30000000-0000-0000-0000-00000000000a'),
 '10000000-0000-0000-0000-000000000002'),'suspended client loses general channel access');
select ok(not has_table_privilege('authenticated','public.messages','insert'),'message table blocks direct insert');
select ok(not has_table_privilege('authenticated','public.channel_memberships','insert'),'membership table blocks direct insert');
select ok(not has_table_privilege('authenticated','public.notifications','insert'),'notification table blocks direct insert');
select ok(not has_table_privilege('authenticated','public.notification_outbox','select'),'outbox is private');
select ok(not has_function_privilege('anon','public.send_message(uuid,text,uuid)','execute'),'anon cannot send');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime'
 and tablename in ('messages','notifications')),2::bigint,'only messaging and notification tables published');
select set_config('test.p10_foreign_channel',(select id from public.channels where organization_id=
 '30000000-0000-0000-0000-00000000000b')::text,true);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
insert into public.notification_preferences(user_id,messages)
values('10000000-0000-0000-0000-000000000006',false);
select is((select messages from public.notification_preferences where user_id=auth.uid()),false,
 'reviewer can save own message preference');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.notification_preferences),0::bigint,
 'another user cannot read reviewer preferences');
select is((select count(*) from public.my_channels() where kind='organization'),1::bigint,
 'client sees one general channel');
select is((select count(*) from public.channels where kind='organization'),1::bigint,
 'RLS hides other organization channel');
select throws_ok($sql$select public.channel_messages(current_setting('test.p10_foreign_channel')::uuid,30,null,null)$sql$,
 '42501','channel_read_forbidden','foreign channel read denied');
select throws_ok($sql$select public.send_message(current_setting('test.p10_foreign_channel')::uuid,
 'forged','80000000-0000-0000-0000-000000000001')$sql$,
 '42501','message_send_forbidden','foreign channel send denied');
select set_config('test.p10_channel',(select id from public.my_channels() where kind='organization')::text,true);
select set_config('test.p10_message',public.send_message(current_setting('test.p10_channel')::uuid,
 'Hello <script>alert(1)</script>','80000000-0000-0000-0000-000000000002')::text,true);
select is(public.send_message(current_setting('test.p10_channel')::uuid,
 'Hello <script>alert(1)</script>','80000000-0000-0000-0000-000000000002'),
 current_setting('test.p10_message')::uuid,'retry returns same message');
select throws_ok($sql$select public.send_message(current_setting('test.p10_channel')::uuid,
 'other body','80000000-0000-0000-0000-000000000002')$sql$,
 '22023','idempotency_key_conflict','same key with different body denied');
select throws_ok($sql$select public.send_message(current_setting('test.p10_channel')::uuid,
 '  ','80000000-0000-0000-0000-000000000003')$sql$,
 '22023','invalid_message','blank body denied');
select is((select count(*) from public.messages where id=current_setting('test.p10_message')::uuid),1::bigint,
 'message visible to sender through RLS');
select is((select count(*) from public.notifications where message_id=current_setting('test.p10_message')::uuid),0::bigint,
 'sender gets no self notification');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000008',true);
select is((select count(*) from public.messages where id=current_setting('test.p10_message')::uuid),0::bigint,
 'other organization cannot read message');
select is((select count(*) from public.notifications where message_id=current_setting('test.p10_message')::uuid),0::bigint,
 'other organization cannot read notification');

reset role;
select is((select count(*) from public.messages where client_message_id='80000000-0000-0000-0000-000000000002'),
 1::bigint,'idempotent send wrote one row');
select is((select count(*) from public.notification_outbox where notification_id in
 (select id from public.notifications where message_id=current_setting('test.p10_message')::uuid)),2::bigint,
 'outbox has one intent per opted-in recipient');
select is((select count(*) from public.notifications where message_id=current_setting('test.p10_message')::uuid
 and recipient_id='10000000-0000-0000-0000-000000000006'),0::bigint,
 'message preference suppresses reviewer notification');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select set_config('test.p10_message2',public.send_message(current_setting('test.p10_channel')::uuid,
 'Second message','80000000-0000-0000-0000-000000000004')::text,true);
select is((select id from public.channel_messages(current_setting('test.p10_channel')::uuid,1)
 limit 1),current_setting('test.p10_message2')::uuid,'first page returns newest message');
select is((select id from public.channel_messages(current_setting('test.p10_channel')::uuid,1,
 (select created_at from public.messages where id=current_setting('test.p10_message2')::uuid),
 current_setting('test.p10_message2')::uuid) limit 1),current_setting('test.p10_message')::uuid,
 'cursor returns the older message without duplication');

select * from finish();
rollback;
