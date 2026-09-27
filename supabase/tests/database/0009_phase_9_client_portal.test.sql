begin;
select no_plan();

select has_table('public','client_publications','publications preserve exact version history');
select has_table('public','client_reviews','client reviews are separate');
select has_table('public','client_review_assignments','client assignments are separate');
select has_table('public','client_review_decisions','client decisions persist');
select has_table('public','client_feedback','contextual comments persist separately');
select has_table('public','notifications','minimal notifications persist');
select ok(not has_table_privilege('authenticated','public.client_review_decisions','insert'),'clients cannot forge decisions');
select ok(not has_table_privilege('authenticated','public.client_publications','select'),'raw publication rows stay private');
select ok(not has_function_privilege('anon','public.record_client_decision(uuid,text,text,uuid)','execute'),'anon cannot decide');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.portal_projects()),1::bigint,'client admin sees only assigned A1');
select is((select count(*) from public.portal_projects() where project_id='60000000-0000-0000-0000-0000000000a3'),0::bigint,'organization membership does not grant A3');
select throws_ok($sql$ select public.portal_project_detail('60000000-0000-0000-0000-0000000000a3') $sql$,
 '42501','client_project_forbidden','foreign same-organization project ID rejected');
select throws_ok($sql$ select public.portal_project_detail('60000000-0000-0000-0000-0000000000b1') $sql$,
 '42501','client_project_forbidden','other-organization project ID rejected');
select is((select count(*) from public.work_items),0::bigint,'client cannot read internal Work');
select is((select count(*) from public.review_assignments),0::bigint,'client cannot read internal reviews');
select is((select count(*) from public.editorial_items),0::bigint,'client cannot read Editorial');
select is((select count(*) from public.opportunities),0::bigint,'client cannot read CRM');
select is((select count(*) from public.portal_approvals()),0::bigint,'client admin has no automatic approval');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.portal_projects()),1::bigint,'reviewer initially sees A3 only');
select is((select count(*) from public.portal_projects() where project_id='60000000-0000-0000-0000-0000000000a1'),0::bigint,'reviewer cannot infer A1 from organization');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000008',true);
select is((select count(*) from public.portal_projects()),1::bigint,'other organization sees its own B1');
select is((select count(*) from public.portal_projects() where project_id='60000000-0000-0000-0000-0000000000a1'),0::bigint,'B cannot enumerate A1');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select ok(public.add_project_member('60000000-0000-0000-0000-0000000000a1',
 '10000000-0000-0000-0000-000000000006','client','client_member',
 '79000000-0000-0000-0000-000000000001') is not null,'Director assigns reviewer to A1');
select ok(public.add_project_member('60000000-0000-0000-0000-0000000000a1',
 '10000000-0000-0000-0000-000000000007','client','client_member',
 '79000000-0000-0000-0000-000000000002') is not null,'Director assigns viewer to A1');
select is(public.configure_review_requirements('60000000-0000-0000-0000-0000000000a1',null,
 array['10000000-0000-0000-0000-000000000001'::uuid],
 '79000000-0000-0000-0000-000000000003'),1,'Director configures internal reviewer');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('test.p9_deliverable',public.create_deliverable('63000000-0000-0000-0000-0000000000a1',
 'Client portal test delivery','79000000-0000-0000-0000-000000000004')::text,true);
select set_config('test.p9_v1',public.submit_deliverable_version(current_setting('test.p9_deliverable')::uuid,
 'Internal V1 notes','79000000-0000-0000-0000-000000000005')::text,true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select ok(public.record_review_decision((select a.id from public.review_assignments a
 join public.review_rounds r on r.id=a.review_round_id
 where r.deliverable_version_id=current_setting('test.p9_v1')::uuid),
 'approve',null,'79000000-0000-0000-0000-000000000006') is not null,'internal review approves V1');
select is(public.publish_deliverable_to_client(current_setting('test.p9_deliverable')::uuid,
 '79000000-0000-0000-0000-000000000007'),current_setting('test.p9_deliverable')::uuid,
 'Director publishes V1');
select is(public.publish_deliverable_to_client(current_setting('test.p9_deliverable')::uuid,
 '79000000-0000-0000-0000-000000000007'),current_setting('test.p9_deliverable')::uuid,
 'publication retry is idempotent');
reset role;
select is((select count(*) from public.client_publications where deliverable_id=current_setting('test.p9_deliverable')::uuid),1::bigint,
 'only one publication created');
select is((select count(*) from public.client_review_assignments a
 join public.client_reviews cr on cr.id=a.client_review_id
 join public.client_publications cp on cp.id=cr.publication_id
 where cp.deliverable_id=current_setting('test.p9_deliverable')::uuid),1::bigint,
 'only the explicit reviewer receives assignment');
select set_config('test.p9_assignment',(select a.id from public.client_review_assignments a
 join public.client_reviews cr on cr.id=a.client_review_id
 join public.client_publications cp on cp.id=cr.publication_id
 where cp.deliverable_id=current_setting('test.p9_deliverable')::uuid)::text,true);
set local role authenticated;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
select is((select count(*) from public.portal_projects() where project_id='60000000-0000-0000-0000-0000000000a1'),1::bigint,'viewer sees assigned A1');
select is((select count(*) from public.portal_approvals()),0::bigint,'viewer has no approvals');
select is((select count(*) from public.portal_deliverables('60000000-0000-0000-0000-0000000000a1')),1::bigint,'viewer sees publication');
select throws_ok($sql$ select public.record_client_decision(
 current_setting('test.p9_assignment')::uuid,'approve',null,
 '79000000-0000-0000-0000-000000000008') $sql$,
 '42501','client_decision_forbidden','viewer cannot decide even with assignment ID');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.portal_approvals()),1::bigint,'assigned reviewer has one approval');
select set_config('test.p9_publication',(select publication_id from public.portal_approvals())::text,true);
select is((public.portal_deliverable_detail(current_setting('test.p9_publication')::uuid)->>'version_number')::integer,
 1,'portal detail pins published V1');
select ok(not public.portal_deliverable_detail(current_setting('test.p9_publication')::uuid)::text like '%Internal V1 notes%',
 'internal version notes excluded from projection');
select ok(public.add_client_feedback(current_setting('test.p9_publication')::uuid,'Please adjust the opening',
 '79000000-0000-0000-0000-000000000009') is not null,'contextual feedback saved');
select set_config('test.p9_decision',public.record_client_decision(current_setting('test.p9_assignment')::uuid,
 'request_changes','Please revise','79000000-0000-0000-0000-000000000010')::text,true);
select is(public.record_client_decision(current_setting('test.p9_assignment')::uuid,
 'request_changes','Please revise','79000000-0000-0000-0000-000000000010'),
 current_setting('test.p9_decision')::uuid,'decision retry returns same immutable row');
reset role;
select is((select status from public.deliverables where id=current_setting('test.p9_deliverable')::uuid),
 'changes_requested','client request returns deliverable to changes workflow');
select is((select status from public.work_items where id='63000000-0000-0000-0000-0000000000a1'),
 'in_progress','client request reopens Work');
set local role authenticated;
select throws_ok($sql$ select * from public.client_review_decisions $sql$,'42501',null,
 'raw client decisions hidden from client');

reset role;
insert into public.file_assets(id,project_id,bucket_id,object_path,original_filename,mime_type,size_bytes,
 uploaded_by,status,finalized_at) values
 ('79000000-0000-0000-0000-0000000000a1','60000000-0000-0000-0000-0000000000a1','project-files',
  '60000000-0000-0000-0000-0000000000a1/79000000-0000-0000-0000-0000000000a1','approved.pdf','application/pdf',12,
  '10000000-0000-0000-0000-000000000004','ready',now()),
 ('79000000-0000-0000-0000-0000000000a2','60000000-0000-0000-0000-0000000000a1','project-files',
  '60000000-0000-0000-0000-0000000000a1/79000000-0000-0000-0000-0000000000a2','internal.pdf','application/pdf',12,
  '10000000-0000-0000-0000-000000000004','ready',now()),
 ('79000000-0000-0000-0000-0000000000b1','60000000-0000-0000-0000-0000000000b1','project-files',
  '60000000-0000-0000-0000-0000000000b1/79000000-0000-0000-0000-0000000000b1','foreign.pdf','application/pdf',12,
  '10000000-0000-0000-0000-000000000011','ready',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('test.p9_v2',public.submit_deliverable_version(current_setting('test.p9_deliverable')::uuid,
 'Internal V2 notes','79000000-0000-0000-0000-000000000011',
 array['79000000-0000-0000-0000-0000000000a1'::uuid])::text,true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
select is(public.file_object_read_allowed('project-files',
 '60000000-0000-0000-0000-0000000000a1/79000000-0000-0000-0000-0000000000a1'),false,
 'unpublished V2 file denied before publication');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select ok(public.record_review_decision((select a.id from public.review_assignments a
 join public.review_rounds r on r.id=a.review_round_id
 where r.deliverable_version_id=current_setting('test.p9_v2')::uuid),
 'approve',null,'79000000-0000-0000-0000-000000000012') is not null,'internal review approves V2');
select is(public.publish_deliverable_to_client(current_setting('test.p9_deliverable')::uuid,
 '79000000-0000-0000-0000-000000000013'),current_setting('test.p9_deliverable')::uuid,'V2 published');
reset role;
select is((select count(*) from public.client_publications where deliverable_id=current_setting('test.p9_deliverable')::uuid),2::bigint,
 'V1 and V2 publication history retained');
select is((select published_version_id from public.deliverables where id=current_setting('test.p9_deliverable')::uuid),
 current_setting('test.p9_v2')::uuid,'deliverable points to exact latest published version');
set local role authenticated;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
select is(public.file_object_read_allowed('project-files',
 '60000000-0000-0000-0000-0000000000a1/79000000-0000-0000-0000-0000000000a1'),true,
 'assigned viewer can read exact published V2 file');
select is(public.file_object_read_allowed('project-files',
 '60000000-0000-0000-0000-0000000000a1/79000000-0000-0000-0000-0000000000a2'),false,
 'same-project internal file denied');
select is(public.file_object_read_allowed('project-files',
 '60000000-0000-0000-0000-0000000000b1/79000000-0000-0000-0000-0000000000b1'),false,
 'foreign Project path denied');
select is((select count(*) from public.portal_documents()),1::bigint,'documents include only published version PDF');
select is(jsonb_array_length(public.portal_deliverable_detail(
 (select publication_id from public.portal_deliverables() where version_number=2 limit 1))->'files'),1,
 'V2 detail contains exactly its linked file');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.portal_approvals()),1::bigint,'new review supersedes closed V1 context');
select throws_ok($sql$ select public.record_client_decision(current_setting('test.p9_assignment')::uuid,
 'approve',null,'79000000-0000-0000-0000-000000000014') $sql$,
 '22023','client_review_closed','cannot decide on old V1 review');
select ok(public.record_client_decision((select assignment_id from public.portal_approvals()),
 'approve',null,'79000000-0000-0000-0000-000000000015') is not null,'reviewer approves V2');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select status from public.deliverables where id=current_setting('test.p9_deliverable')::uuid),
 'client_approved','all required client reviewers approved');
select is(jsonb_array_length(public.internal_client_review_history('63000000-0000-0000-0000-0000000000a1')),
 2,'OMNIA can inspect full client history');
reset role;
select is((select count(*) from public.audit_events where event_type like 'client.review.%'
  and resource_id in (select id from public.client_review_decisions)),2::bigint,'client decisions audited once');
select is((select count(*) from public.notifications where kind='client_approved'),2::bigint,'internal approval notifications persisted');

select * from finish();
rollback;
