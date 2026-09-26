begin;
select no_plan();

select has_table('public','content_templates','templates exist');
select has_table('public','editorial_cycles','cycles exist');
select has_table('public','editorial_items','editorial items exist');
select has_table('public','work_applications','applications exist');
select hasnt_table('public','editorial_weeks','weeks are derived from dates');
select has_column('public','editorial_items','work_item_id','editorial specializes canonical work');
select hasnt_column('public','editorial_items','assignee_id','editorial does not duplicate assignee');
select hasnt_column('public','editorial_items','work_status','editorial does not duplicate Work state');
select has_index('public','editorial_items','editorial_items_window_idx','date-window query is indexed');
select has_index('public','work_applications','work_applications_one_accepted_idx','only one accepted applicant is possible');
select ok(not has_table_privilege('authenticated','public.editorial_items','insert'),'browser cannot directly create editorial item');
select ok(not has_table_privilege('authenticated','public.work_applications','insert'),'browser cannot impersonate applicant');
select ok(not has_table_privilege('authenticated','public.work_item_assignees','update'),'browser cannot bypass Work assignment');
select ok(not has_function_privilege('anon','public.apply_to_editorial_work(uuid)','execute'),'anonymous cannot apply');
select ok(not has_function_privilege('anon','public.accept_editorial_application(uuid)','execute'),'anonymous cannot assign');
select ok(has_function_privilege('authenticated','public.apply_to_editorial_work(uuid)','execute'),'authenticated may invoke server-authorized apply');

select throws_ok($sql$ insert into public.editorial_cycles(project_id,name,start_date,end_date,created_by)
  values('60000000-0000-0000-0000-0000000000a1','Bad','2030-02-02','2030-02-01','10000000-0000-0000-0000-000000000001') $sql$,
  '23514',null,'cycle start must be at or before end');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($sql$ select public.editorial_calendar('2030-10-01','2030-10-31') $sql$,'42501',null,'anonymous cannot read calendar');
select throws_ok($sql$ select * from public.editorial_items $sql$,'42501',null,'anonymous cannot query editorial items');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select ok(public.project_access_allowed('60000000-0000-0000-0000-0000000000a1','editorial.plan'),'PM A can plan in Project A1');
select ok(not public.project_access_allowed('60000000-0000-0000-0000-0000000000b1','editorial.plan'),'PM A cannot plan in Project B1');
select set_config('test.editorial_template',public.create_content_template('60000000-0000-0000-0000-0000000000a1','Standard','instagram','post','Brief')::text,true);
select set_config('test.editorial_cycle',public.create_editorial_cycle('60000000-0000-0000-0000-0000000000a1','Flexible cycle','2030-10-01','2030-11-10')::text,true);
select throws_ok($sql$ select public.create_editorial_cycle('60000000-0000-0000-0000-0000000000b1','Cross project','2030-10-01','2030-10-31') $sql$,
  '42501','editorial_plan_forbidden','PM A cannot create Project B cycle');
select set_config('test.editorial_item',public.create_editorial_item(
  '60000000-0000-0000-0000-0000000000a1',current_setting('test.editorial_cycle')::uuid,
  current_setting('test.editorial_template')::uuid,'Editorial pgTAP','',
  '2030-10-31',null,null,null,'76000000-0000-0000-0000-000000000001')::text,true);
select is(public.create_editorial_item(
  '60000000-0000-0000-0000-0000000000a1',current_setting('test.editorial_cycle')::uuid,
  current_setting('test.editorial_template')::uuid,'Replay','',
  '2030-10-31',null,null,null,'76000000-0000-0000-0000-000000000001'),
  current_setting('test.editorial_item')::uuid,'item creation is idempotent');
select is((select ei.project_id from public.editorial_items ei where ei.id=current_setting('test.editorial_item')::uuid),
  '60000000-0000-0000-0000-0000000000a1'::uuid,'item project matches cycle and Work');
select is((select count(*) from public.editorial_calendar('2030-10-01','2030-10-31') c where c.item_id=current_setting('test.editorial_item')::uuid),
  1::bigint,'PM calendar returns scoped piece in date window');
select is((select count(*) from public.editorial_calendar('2030-11-01','2030-11-30') c where c.item_id=current_setting('test.editorial_item')::uuid),
  0::bigint,'calendar excludes pieces outside visible window');
select throws_ok($sql$ select public.create_editorial_item('60000000-0000-0000-0000-0000000000a1',current_setting('test.editorial_cycle')::uuid,
  null,'Outside cycle','', '2030-12-01',null,'instagram','post','76000000-0000-0000-0000-000000000002') $sql$,
  '22023','editorial_cycle_date_invalid','piece cannot be scheduled outside cycle');
select throws_ok($sql$ update public.editorial_items set project_id='60000000-0000-0000-0000-0000000000b1'
  where id=current_setting('test.editorial_item')::uuid $sql$,'42501',null,'browser cannot move editorial Project');
select throws_ok($sql$ select public.publish_editorial_available('63000000-0000-0000-0000-0000000000a1') $sql$,
  '42501','editorial_publish_forbidden','Work ID is not an editorial item ID');
select is(public.publish_editorial_available(current_setting('test.editorial_item')::uuid),
  current_setting('test.editorial_item')::uuid,'PM publishes availability');
select throws_ok(format($sql$ select public.transition_work_item(%L,'in_progress','76000000-0000-0000-0000-000000000003') $sql$,
  (select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid)),
  '22023','editorial_work_not_assigned','generic Work transition cannot bypass available planning state');
select throws_ok(format($sql$ select public.archive_work_item(%L,'76000000-0000-0000-0000-000000000004') $sql$,
  (select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid)),
  '22023','archive_editorial_first','generic Work archive cannot strand available applications');
select throws_ok($sql$ select public.publish_editorial_available(current_setting('test.editorial_item')::uuid) $sql$,
  '42501','editorial_publish_forbidden','availability transition cannot repeat');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.editorial_items where id=current_setting('test.editorial_item')::uuid),1::bigint,'Contributor A sees scoped editorial');
select ok(not exists(select 1 from public.editorial_items where project_id='60000000-0000-0000-0000-0000000000b1'),'Contributor A cannot see Project B editorial');
select throws_ok($sql$ select public.create_editorial_cycle('60000000-0000-0000-0000-0000000000a1','Escalation','2030-10-01','2030-10-31') $sql$,
  '42501','editorial_plan_forbidden','contributor cannot create cycle');
select throws_ok($sql$ select public.publish_editorial_available(current_setting('test.editorial_item')::uuid) $sql$,
  '42501','editorial_publish_forbidden','contributor cannot publish availability');
select set_config('test.editorial_application',public.apply_to_editorial_work(current_setting('test.editorial_item')::uuid)::text,true);
select is(public.apply_to_editorial_work(current_setting('test.editorial_item')::uuid),current_setting('test.editorial_application')::uuid,'application retry returns same row');
select is((select count(*) from public.work_applications where editorial_item_id=current_setting('test.editorial_item')::uuid),1::bigint,'duplicate active application is impossible');
select throws_ok($sql$ insert into public.work_applications(editorial_item_id,applicant_id)
  values(current_setting('test.editorial_item')::uuid,'10000000-0000-0000-0000-000000000011') $sql$,
  '42501',null,'contributor cannot apply on behalf of another user');
select throws_ok($sql$ select public.apply_to_editorial_work('00000000-0000-0000-0000-000000000001') $sql$,
  '42501','editorial_apply_forbidden','contributor cannot apply to inaccessible item');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.editorial_items),0::bigint,'client cannot read editorial');
select is((select count(*) from public.work_applications),0::bigint,'client cannot read applications');
select throws_ok($sql$ select public.editorial_calendar('2030-10-01','2030-10-31') $sql$,
  '42501','editorial_view_forbidden','client calendar RPC denied');
select throws_ok($sql$ select public.apply_to_editorial_work(current_setting('test.editorial_item')::uuid) $sql$,
  '42501','editorial_apply_forbidden','client cannot apply');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is(public.accept_editorial_application(current_setting('test.editorial_application')::uuid),
  (select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid),
  'PM acceptance returns canonical Work');
select is((select planning_state from public.editorial_items where id=current_setting('test.editorial_item')::uuid),'assigned','Editorial planning state assigned');
select is((select status from public.work_applications where id=current_setting('test.editorial_application')::uuid),'accepted','one application accepted');
select is((select status from public.work_items where id=(select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid)),
  'todo','Work execution state remains independent of Editorial assigned state');
select is(public.transition_work_item((select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid),
  'in_progress','76000000-0000-0000-0000-000000000005'),
  (select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid),
  'assigned editorial Work may enter execution');
select is((select planning_state from public.editorial_items where id=current_setting('test.editorial_item')::uuid),
  'assigned','Work execution transition does not overwrite Editorial planning state');
select throws_ok($sql$ select public.publish_editorial_available(current_setting('test.editorial_item')::uuid) $sql$,
  '42501','editorial_publish_forbidden','assigned item cannot return to available');
select throws_ok($sql$ select public.update_editorial_item(current_setting('test.editorial_item')::uuid,
  'Unauthorized edit','', '2030-10-31',null,'instagram','post') $sql$,
  '42501','editorial_update_forbidden','assigned editorial item cannot be silently edited');
select is((select count(*) from public.my_space_items() where item_id=(select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid)),0::bigint,'PM My Space does not inherit contributor Work');
reset role;
select ok(exists(select 1 from public.domain_events where resource_id=current_setting('test.editorial_item')::uuid and event_type='editorial.item.assigned'),'assignment emitted domain event');
select ok(exists(select 1 from public.audit_events where resource_id=current_setting('test.editorial_item')::uuid and event_type='editorial.item.assigned'),'assignment emitted audit event');
set local role authenticated;
select is(public.accept_editorial_application(current_setting('test.editorial_application')::uuid),
  (select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid),
  'accepted application retry returns same Work without duplicate assignment');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.my_space_items() where item_id=(select work_item_id from public.editorial_items where id=current_setting('test.editorial_item')::uuid)),1::bigint,'accepted contributor sees canonical Work in My Space');

reset role;
select throws_ok(format($sql$ insert into public.editorial_items(project_id,cycle_id,work_item_id,title,scheduled_date,channel,format,created_by)
  values('60000000-0000-0000-0000-0000000000a1',%L,'63000000-0000-0000-0000-0000000000b1','Cross-project','2030-10-31','instagram','post','10000000-0000-0000-0000-000000000001') $sql$,
  current_setting('test.editorial_cycle')),'23503',null,'composite FK rejects cross-project Work');

select * from finish();
rollback;
