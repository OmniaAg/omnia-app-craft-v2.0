begin;
select no_plan();

select has_table('public','deliverables','stable deliverables exist');
select has_table('public','deliverable_versions','version snapshots exist');
select has_table('public','review_requirements','configurable requirements exist');
select has_table('public','review_rounds','rounds exist');
select has_table('public','review_assignments','assignment snapshots exist');
select has_table('public','review_decisions','authoritative decisions exist');
select has_table('public','review_overrides','director exception evidence exists');
select has_index('public','deliverable_versions','deliverable_versions_deliverable_history_idx','history index exists');
select has_index('public','review_assignments','review_assignments_reviewer_pending_idx','review queue index exists');
select ok(not has_table_privilege('authenticated','public.deliverables','update'),'browser cannot directly approve deliverable');
select ok(not has_table_privilege('authenticated','public.review_requirements','insert'),'browser cannot assign self as reviewer');
select ok(not has_table_privilege('authenticated','public.review_assignments','update'),'browser cannot rewrite assignments');
select ok(not has_table_privilege('authenticated','public.review_decisions','insert'),'browser cannot forge a decision');
select ok(not has_table_privilege('authenticated','public.review_decisions','update'),'browser cannot revise a decision');
select ok(not has_function_privilege('anon','public.record_review_decision(uuid,text,text,uuid)','execute'),'anonymous has no review command');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($sql$ select public.review_queue() $sql$,'42501',null,'anon cannot read queue');
select throws_ok($sql$ select * from public.deliverables $sql$,'42501',null,'anon cannot read internal deliveries');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',null,
  array['10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000001'::uuid],
  '77000000-0000-0000-0000-000000000001'),2,'director configures PM and Director');
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',null,
  array['10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000001'::uuid],
  '77000000-0000-0000-0000-000000000001'),2,'configuration retry is idempotent');
select throws_ok($sql$ select public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',null,
  array['10000000-0000-0000-0000-000000000005'::uuid],
  '77000000-0000-0000-0000-000000000002') $sql$,
  '22023','reviewer_not_eligible','client cannot satisfy internal requirement');
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000b1',null,
  array['10000000-0000-0000-0000-000000000002'::uuid],
  '77000000-0000-0000-0000-000000000003'),1,'Project B independently requires one PM');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',null,
  array['10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000001'::uuid],
  '77000000-0000-0000-0000-000000000004'),2,'scoped PM configures assigned Project A');
select throws_ok($sql$ select public.configure_review_requirements('60000000-0000-0000-0000-0000000000b1',null,
  array['10000000-0000-0000-0000-000000000002'::uuid],
  '77000000-0000-0000-0000-000000000028') $sql$,
  '42501','review_configure_forbidden','scoped PM cannot configure Project B');
select throws_ok($sql$ select public.create_deliverable('63000000-0000-0000-0000-0000000000b1','Cross Project',
  '77000000-0000-0000-0000-000000000005') $sql$,
  '42501','deliverable_create_forbidden','PM A cannot create in Project B');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('test.phase7_deliverable',public.create_deliverable('63000000-0000-0000-0000-0000000000a1',
  'Phase 7 pgTAP','77000000-0000-0000-0000-000000000006')::text,true);
select is(public.create_deliverable('63000000-0000-0000-0000-0000000000a1',
  'Phase 7 pgTAP','77000000-0000-0000-0000-000000000006'),
  current_setting('test.phase7_deliverable')::uuid,'create retry returns stable deliverable');
select throws_ok($sql$ select public.create_deliverable('63000000-0000-0000-0000-0000000000a4',
  'Unassigned','77000000-0000-0000-0000-000000000007') $sql$,
  '42501','deliverable_create_forbidden','contributor cannot create for unassigned Work');
select throws_ok($sql$ update public.deliverables set project_id='60000000-0000-0000-0000-0000000000b1'
  where id=current_setting('test.phase7_deliverable')::uuid $sql$,'42501',null,'actor cannot move deliverable');
select set_config('test.phase7_v1',public.submit_deliverable_version(current_setting('test.phase7_deliverable')::uuid,
  'Initial historical notes','77000000-0000-0000-0000-000000000008')::text,true);
select is(public.submit_deliverable_version(current_setting('test.phase7_deliverable')::uuid,
  'Initial historical notes','77000000-0000-0000-0000-000000000008'),
  current_setting('test.phase7_v1')::uuid,'submission retry returns V1');
select is((select version_number from public.deliverable_versions where id=current_setting('test.phase7_v1')::uuid),
  1,'server reserves V1 number');
select is((select count(*) from public.review_assignments a join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_v1')::uuid),2::bigint,'V1 snapshots two assignments');
select is((select status from public.work_items where id='63000000-0000-0000-0000-0000000000a1'),
  'in_progress','submission starts Work execution');
select throws_ok($sql$ select public.transition_work_item('63000000-0000-0000-0000-0000000000a1','done',
  '77000000-0000-0000-0000-000000000009') $sql$,
  '22023','deliverable_review_required','generic Work transition cannot bypass review');
select is((select count(*) from public.review_queue()),0::bigint,'submitter has no review queue assignment');
select set_config('test.phase7_pm_assignment',(select a.id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_v1')::uuid
    and a.reviewer_id='10000000-0000-0000-0000-000000000003')::text,true);
select set_config('test.phase7_director_assignment',(select a.id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_v1')::uuid
    and a.reviewer_id='10000000-0000-0000-0000-000000000001')::text,true);
select throws_ok($sql$ select public.record_review_decision(current_setting('test.phase7_pm_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000010') $sql$,
  '42501','review_decision_forbidden','contributor cannot decide reviewer assignment');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.review_queue() where assignment_id=current_setting('test.phase7_pm_assignment')::uuid),
  1::bigint,'PM queue contains own pending assignment');
select is((select count(*) from public.review_queue() where assignment_id=current_setting('test.phase7_director_assignment')::uuid),
  0::bigint,'PM queue excludes Director assignment');
select set_config('test.phase7_decision',public.record_review_decision(current_setting('test.phase7_pm_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000011')::text,true);
select is(public.record_review_decision(current_setting('test.phase7_pm_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000011'),
  current_setting('test.phase7_decision')::uuid,'decision retry returns authoritative row');
select is((select status from public.review_rounds where deliverable_version_id=current_setting('test.phase7_v1')::uuid),
  'pending','one approval cannot close two-reviewer round');
select throws_ok($sql$ select public.record_review_decision(current_setting('test.phase7_director_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000012') $sql$,
  '42501','review_decision_forbidden','PM cannot decide for Director');
select throws_ok($sql$ select public.override_review_requirement(current_setting('test.phase7_director_assignment')::uuid,
  'Reason','77000000-0000-0000-0000-000000000013') $sql$,
  '42501','review_override_forbidden','PM cannot override');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.deliverables),0::bigint,'client cannot read internal deliverables');
select is((select count(*) from public.review_rounds),0::bigint,'client cannot read internal rounds');
select is((select count(*) from public.review_decisions),0::bigint,'client cannot read internal decisions');
select throws_ok($sql$ select public.deliverable_detail('63000000-0000-0000-0000-0000000000a1') $sql$,
  '42501','deliverable_detail_forbidden','client cannot use internal detail RPC');
select throws_ok($sql$ select public.record_review_decision(current_setting('test.phase7_director_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000014') $sql$,
  '42501','review_decision_forbidden','client cannot approve internal review');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select throws_ok($sql$ select public.override_review_requirement(current_setting('test.phase7_director_assignment')::uuid,
  '','77000000-0000-0000-0000-000000000015') $sql$,
  '22023','override_reason_required','override requires a reason');
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',null,
  array['10000000-0000-0000-0000-000000000001'::uuid],
  '77000000-0000-0000-0000-000000000016'),1,'future rounds reconfigured to Director only');
select is((select count(*) from public.review_assignments a join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_v1')::uuid),2::bigint,'V1 snapshot ignores config change');
select is(public.record_review_decision(current_setting('test.phase7_director_assignment')::uuid,
  'request_changes','Revise structure','77000000-0000-0000-0000-000000000017') is not null,true,
  'Director asks for changes');
select is((select status from public.review_rounds where deliverable_version_id=current_setting('test.phase7_v1')::uuid),
  'changes_requested','one request changes closes round');
select is((select status from public.deliverables where id=current_setting('test.phase7_deliverable')::uuid),
  'changes_requested','deliverable returns for new submission');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('test.phase7_v2',public.submit_deliverable_version(current_setting('test.phase7_deliverable')::uuid,
  'Revised historical notes','77000000-0000-0000-0000-000000000018')::text,true);
select is((select version_number from public.deliverable_versions where id=current_setting('test.phase7_v2')::uuid),
  2,'new version number follows V1');
select is((select count(*) from public.review_assignments a join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_v2')::uuid),1::bigint,'V2 snapshots new configuration');
select is((select notes from public.deliverable_versions where id=current_setting('test.phase7_v1')::uuid),
  'Initial historical notes','V1 content survives V2');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('test.phase7_v2_assignment',(select a.id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_v2')::uuid)::text,true);
select is(public.record_review_decision(current_setting('test.phase7_v2_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000019') is not null,true,'sole required reviewer approves V2');
select is((select status from public.deliverables where id=current_setting('test.phase7_deliverable')::uuid),
  'ready_for_client','approval prepares client delivery');
select is((select status from public.work_items where id='63000000-0000-0000-0000-0000000000a1'),
  'done','review completion closes Work');
select is((select count(*) from public.domain_events where event_type='deliverable.version.submitted'
  and payload->>'deliverable_id'=current_setting('test.phase7_deliverable')),2::bigint,'two submission events retained');
select is((select count(*) from public.audit_events where event_type='review.decision.recorded'
  and resource_id in (select id from public.review_decisions where review_assignment_id in
    (current_setting('test.phase7_pm_assignment')::uuid,current_setting('test.phase7_director_assignment')::uuid,
      current_setting('test.phase7_v2_assignment')::uuid))),3::bigint,'decisions audited once');
select is(public.add_project_member('60000000-0000-0000-0000-0000000000a1',
  '10000000-0000-0000-0000-000000000006','client','client_member',
  '77000000-0000-0000-0000-000000000029') is not null,true,
  'publication requires an explicitly assigned client reviewer');
select is(public.publish_deliverable_to_client(current_setting('test.phase7_deliverable')::uuid,
  '77000000-0000-0000-0000-000000000020'),current_setting('test.phase7_deliverable')::uuid,
  'Director publishes explicitly');
select throws_ok($sql$ select public.transition_work_item('63000000-0000-0000-0000-0000000000a1',
  'in_progress','77000000-0000-0000-0000-000000000027') $sql$,
  '22023','deliverable_review_complete','generic Work command cannot reopen an approved deliverable');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is(public.submit_deliverable_version(current_setting('test.phase7_deliverable')::uuid,
  'Revised historical notes','77000000-0000-0000-0000-000000000018'),
  current_setting('test.phase7_v2')::uuid,'late retry returns V2 after Work is done');
select set_config('test.phase7_override_deliverable',public.create_deliverable(
  '63000000-0000-0000-0000-0000000000a2','Override pgTAP',
  '77000000-0000-0000-0000-000000000022')::text,true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',
  current_setting('test.phase7_override_deliverable')::uuid,
  array['10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000001'::uuid],
  '77000000-0000-0000-0000-000000000023'),2,'deliverable-specific requirements override Project defaults');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('test.phase7_override_version',public.submit_deliverable_version(
  current_setting('test.phase7_override_deliverable')::uuid,'Override candidate',
  '77000000-0000-0000-0000-000000000024')::text,true);
select set_config('test.phase7_override_pm_assignment',(select a.id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_override_version')::uuid
    and a.reviewer_id='10000000-0000-0000-0000-000000000003')::text,true);
select set_config('test.phase7_override_director_assignment',(select a.id from public.review_assignments a
  join public.review_rounds r on r.id=a.review_round_id
  where r.deliverable_version_id=current_setting('test.phase7_override_version')::uuid
    and a.reviewer_id='10000000-0000-0000-0000-000000000001')::text,true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is(public.record_review_decision(current_setting('test.phase7_override_director_assignment')::uuid,
  'approve',null,'77000000-0000-0000-0000-000000000025') is not null,true,'Director approves own requirement');
select set_config('test.phase7_override_id',public.override_review_requirement(
  current_setting('test.phase7_override_pm_assignment')::uuid,'PM unavailable',
  '77000000-0000-0000-0000-000000000026')::text,true);
select is(public.override_review_requirement(
  current_setting('test.phase7_override_pm_assignment')::uuid,'PM unavailable',
  '77000000-0000-0000-0000-000000000026'),current_setting('test.phase7_override_id')::uuid,
  'override retry returns same evidence');
select is((select status from public.review_assignments
  where id=current_setting('test.phase7_override_pm_assignment')::uuid),'overridden',
  'override differs from approval decision');
select is((select count(*) from public.review_decisions
  where review_assignment_id=current_setting('test.phase7_override_pm_assignment')::uuid),0::bigint,
  'overridden reviewer did not approve');
select is((select status from public.review_rounds where deliverable_version_id=
  current_setting('test.phase7_override_version')::uuid),'approved','override resolves round with other approval');
select is((select count(*) from public.review_overrides ro join public.audit_events ae
  on ae.event_id=ro.audit_event_id where ro.id=current_setting('test.phase7_override_id')::uuid
    and ro.reason='PM unavailable' and ro.reviewer_id='10000000-0000-0000-0000-000000000003'
    and ae.event_type='review.requirement.overridden'),1::bigint,'override points to complete audit event');
reset role;

select throws_ok($sql$ update public.deliverable_versions set notes='tampered'
  where id=current_setting('test.phase7_v1')::uuid $sql$,'23514','review_history_immutable','V1 cannot be rewritten');
select throws_ok($sql$ update public.review_decisions set decision='request_changes'
  where id=current_setting('test.phase7_decision')::uuid $sql$,'23514','review_history_immutable','decision cannot be rewritten');
select throws_ok($sql$ delete from public.review_assignments
  where id=current_setting('test.phase7_pm_assignment')::uuid $sql$,'23514','review_history_immutable','assignment cannot be deleted');
select throws_ok($sql$ update public.review_overrides set reason='rewritten'
  where id=current_setting('test.phase7_override_id')::uuid $sql$,
  '23514','review_history_immutable','override evidence cannot be rewritten');
select throws_ok($sql$ insert into public.deliverables(project_id,work_item_id,title,created_by,create_key)
  values('60000000-0000-0000-0000-0000000000b1','63000000-0000-0000-0000-0000000000a3','Bad relation',
    '10000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000021') $sql$,
  '23503',null,'FK blocks cross-project Work relation');

select * from finish();
rollback;
