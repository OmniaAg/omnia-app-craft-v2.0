begin;
select no_plan();

-- fixtures:start (also loaded by test:analytics; existing seed is untouched)
insert into public.projects(id,brand_id,name,status,created_by) values
 ('60000000-0000-0000-0000-0000000012a1','31000000-0000-0000-0000-0000000000a1','Analytics fixture','active','10000000-0000-0000-0000-000000000001');
insert into public.project_memberships(project_id,user_id,member_type,responsibility,created_by) values
 ('60000000-0000-0000-0000-0000000012a1','10000000-0000-0000-0000-000000000003','internal','lead','10000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-0000000012a1','10000000-0000-0000-0000-000000000005','client','client_member','10000000-0000-0000-0000-000000000001');
insert into public.milestones(project_id,name,status,created_by) values
 ('60000000-0000-0000-0000-0000000012a1','Complete','completed','10000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-0000000012a1','Pending','planned','10000000-0000-0000-0000-000000000001');
insert into public.work_items(id,project_id,title,status,priority,created_by,created_at,due_at,completed_at) values
 ('63000000-0000-0000-0000-000000001201','60000000-0000-0000-0000-0000000012a1','Overdue','todo','high','10000000-0000-0000-0000-000000000001','2026-09-02T06:00:00Z','2020-01-01T06:00:00Z',null),
 ('63000000-0000-0000-0000-000000001202','60000000-0000-0000-0000-0000000012a1','Future','in_progress','normal','10000000-0000-0000-0000-000000000001','2026-09-02T06:00:00Z','2099-01-01T06:00:00Z',null),
 ('63000000-0000-0000-0000-000000001203','60000000-0000-0000-0000-0000000012a1','Blocked','blocked','urgent','10000000-0000-0000-0000-000000000001','2026-09-02T06:00:00Z',null,null),
 ('63000000-0000-0000-0000-000000001204','60000000-0000-0000-0000-0000000012a1','Done one day','done','low','10000000-0000-0000-0000-000000000001','2026-09-02T06:00:00Z',null,'2026-09-03T06:00:00Z'),
 ('63000000-0000-0000-0000-000000001205','60000000-0000-0000-0000-0000000012a1','Done four days','done','normal','10000000-0000-0000-0000-000000000001','2026-09-02T06:00:00Z',null,'2026-09-06T06:00:00Z');
insert into public.editorial_cycles(id,project_id,name,start_date,end_date,created_by) values
 ('65000000-0000-0000-0000-000000001201','60000000-0000-0000-0000-0000000012a1','September','2026-09-01','2026-09-30','10000000-0000-0000-0000-000000000001');
insert into public.editorial_items(project_id,cycle_id,work_item_id,title,scheduled_date,channel,format,planning_state,created_by) values
 ('60000000-0000-0000-0000-0000000012a1','65000000-0000-0000-0000-000000001201','63000000-0000-0000-0000-000000001201','Planned','2026-09-01','instagram','post','planned','10000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-0000000012a1','65000000-0000-0000-0000-000000001201','63000000-0000-0000-0000-000000001202','Available','2026-09-15','instagram','video','available','10000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-0000000012a1','65000000-0000-0000-0000-000000001201','63000000-0000-0000-0000-000000001203','Assigned','2026-09-30','website','article','assigned','10000000-0000-0000-0000-000000000001');
insert into public.deliverables(id,project_id,work_item_id,title,status,created_by,create_key) values
 ('66000000-0000-0000-0000-000000001201','60000000-0000-0000-0000-0000000012a1','63000000-0000-0000-0000-000000001204','Delivered','published_to_client','10000000-0000-0000-0000-000000000001',gen_random_uuid()),
 ('66000000-0000-0000-0000-000000001202','60000000-0000-0000-0000-0000000012a1','63000000-0000-0000-0000-000000001205','Revised','changes_requested','10000000-0000-0000-0000-000000000001',gen_random_uuid());
insert into public.deliverable_versions(id,deliverable_id,version_number,notes,submitted_by,submission_key,submitted_at) values
 ('67000000-0000-0000-0000-000000001201','66000000-0000-0000-0000-000000001201',1,'Safe content','10000000-0000-0000-0000-000000000001',gen_random_uuid(),'2026-09-10T06:00:00Z'),
 ('67000000-0000-0000-0000-000000001202','66000000-0000-0000-0000-000000001202',1,'Internal content','10000000-0000-0000-0000-000000000001',gen_random_uuid(),'2026-09-10T06:00:00Z');
insert into public.review_rounds(deliverable_version_id,status,opened_at,closed_at) values
 ('67000000-0000-0000-0000-000000001201','approved','2026-09-10T06:00:00Z','2026-09-10T08:00:00Z'),
 ('67000000-0000-0000-0000-000000001202','changes_requested','2026-09-10T06:00:00Z','2026-09-10T12:00:00Z');
insert into public.review_requirements(id,project_id,reviewer_id,created_by) values
 ('71000000-0000-0000-0000-000000001201','60000000-0000-0000-0000-0000000012a1','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('71000000-0000-0000-0000-000000001202','60000000-0000-0000-0000-0000000012a1','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001');
insert into public.review_assignments(review_round_id,requirement_id,reviewer_id,requirement_scope,status,resolved_at)
 select r.id,q.id,q.reviewer_id,'project',r.status,r.closed_at from public.review_rounds r cross join public.review_requirements q
 where r.deliverable_version_id in ('67000000-0000-0000-0000-000000001201','67000000-0000-0000-0000-000000001202')
 and q.id in ('71000000-0000-0000-0000-000000001201','71000000-0000-0000-0000-000000001202');
insert into public.client_publications(id,deliverable_id,project_id,version_id,published_by,idempotency_key,published_at) values
 ('68000000-0000-0000-0000-000000001201','66000000-0000-0000-0000-000000001201','60000000-0000-0000-0000-0000000012a1','67000000-0000-0000-0000-000000001201','10000000-0000-0000-0000-000000000001',gen_random_uuid(),'2026-09-11T06:00:00Z');
insert into public.client_reviews(publication_id,status,opened_at,closed_at) values
 ('68000000-0000-0000-0000-000000001201','approved','2026-09-11T06:00:00Z','2026-09-12T06:00:00Z');
insert into public.billing_documents(id,organization_id,project_id,date,due_date,currency,subtotal_amount,total_amount,created_by) values
 ('69000000-0000-0000-0000-000000001201','30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000012a1','2026-09-01','2020-01-01','MXN',10000,10000,'10000000-0000-0000-0000-000000000001'),
 ('69000000-0000-0000-0000-000000001202','30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000012a1','2026-09-30','2099-01-01','MXN',5000,5000,'10000000-0000-0000-0000-000000000001'),
 ('69000000-0000-0000-0000-000000001203','30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000012a1','2026-09-15',null,'USD',1000,1000,'10000000-0000-0000-0000-000000000001'),
 ('69000000-0000-0000-0000-000000001204','30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000012a1','2026-09-15',null,'MXN',9999,9999,'10000000-0000-0000-0000-000000000001');
insert into public.billing_document_items(billing_document_id,description,quantity,unit_price,line_total)
select '69000000-0000-0000-0000-000000001201',description,1,amount,amount from (values('One',3000),('Two',3000),('Three',4000)) x(description,amount);
update public.billing_documents set status='issued',number='ANALYTICS-'||right(id::text,4),issued_at='2026-09-01T06:00:00Z' where id in
 ('69000000-0000-0000-0000-000000001201','69000000-0000-0000-0000-000000001202','69000000-0000-0000-0000-000000001203');
insert into public.payment_records(billing_document_id,amount,currency,received_at,method,recorded_by,voided_at) values
 ('69000000-0000-0000-0000-000000001201',2500,'MXN','2026-09-10T06:00:00Z','transfer','10000000-0000-0000-0000-000000000001',null),
 ('69000000-0000-0000-0000-000000001201',2500,'MXN','2026-09-12T06:00:00Z','transfer','10000000-0000-0000-0000-000000000001',null),
 ('69000000-0000-0000-0000-000000001201',700,'MXN','2026-09-12T06:00:00Z','transfer','10000000-0000-0000-0000-000000000001',now());
insert into public.project_reports(id,project_id,title,from_date,to_date,created_by) values
 ('70000000-0000-0000-0000-000000001201','60000000-0000-0000-0000-0000000012a1','September report','2026-09-01','2026-09-30','10000000-0000-0000-0000-000000000001');
-- fixtures:end

select has_table('public','project_reports','explicit report definitions/publications exist');
select has_function('public','analytics_overview',array['date','date','uuid','uuid','uuid','uuid'],'overview RPC exists');
select has_function('public','analytics_billing',array['date','date','uuid','uuid','uuid','uuid','text'],'separate financial RPC exists');
select ok(not has_function_privilege('anon','public.analytics_overview(date,date,uuid,uuid,uuid,uuid)','execute'),'anonymous RPC denied');
select ok(not has_function_privilege('authenticated','app_private.analytics_scope(uuid,uuid,uuid,uuid,text)','execute'),'private scope is not callable');
select ok(not has_column_privilege('authenticated','public.project_reports','created_by','select'),'report author identity is not exposed');
select ok(not has_table_privilege('authenticated','public.project_reports','insert'),'cannot forge publications with direct writes');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is(public.analytics_overview('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'open_work','3','three open items');
select is(public.analytics_overview('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'overdue_work','1','one overdue instant');
select is(public.analytics_overview('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'blocked_work','1','one blocked');
select is(public.analytics_overview('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'completed_period','2','two completions');
select is(public.analytics_work('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'median_completion_days','2.5','exact completion median');
select is(public.analytics_work('2026-09-03','2026-09-03',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'completed_period','1','inclusive Mexico date lower bound');
select is(public.analytics_work('2026-09-02','2026-09-02',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'completed_period','0','exclusive next local midnight');
select is(jsonb_array_length(public.analytics_work('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->'series'),30,'zero-filled daily completion buckets');
select is(public.analytics_projects('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{items,0,milestones_done}','1','completed milestone counted once');
select is(public.analytics_editorial('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{states,planned}','1','planned piece');
select is(public.analytics_editorial('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{states,available}','1','available piece');
select is(public.analytics_editorial('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{channels,instagram}','2','channel exact count');
select is(public.analytics_reviews('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'submitted_period','2','versions not multiplied by rounds');
select is(public.analytics_reviews('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'median_internal_hours','4.0','internal duration median two and six hours');
select is(public.analytics_reviews('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')->>'median_client_hours','24.0','client duration separate');
select is(public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{currencies,0,issued_amount}','15000.00','MXN totals not multiplied by three line items');
select is(public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{currencies,0,paid_amount}','5000.00','two payments aggregated once; void excluded');
select is(public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{currencies,0,remaining_amount}','10000.00','remaining amount correct');
select is(public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')#>>'{currencies,1,issued_amount}','1000.00','USD stays separate');
select is(jsonb_array_length(public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1',p_currency=>'USD')->'currencies'),1,'currency filter');
select is(jsonb_array_length(public.analytics_work_details('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1',p_filter=>'open',p_limit=>2)->'items'),2,'server pagination bounded');
select throws_ok($$select public.analytics_work('2026-09-30','2026-09-01')$$,'22023','invalid_analytics_range_or_page','reversed range denied');
select throws_ok($$select public.analytics_work('2020-01-01','2026-09-01')$$,'22023','invalid_analytics_range_or_page','huge range denied');
select throws_ok($$select public.analytics_work_details('2026-09-01','2026-09-30',p_filter=>'arbitrary SQL')$$,'22023','invalid_analytics_filter','sort/filter injection denied');
select throws_ok($$select public.analytics_billing('2026-09-01','2026-09-30',p_currency=>'MXN;drop')$$,'22023','invalid_analytics_currency','invalid currency denied');
select lives_ok($$select public.export_analytics('billing','2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')$$,'authorized export calls same aggregate');
select lives_ok($$select public.set_project_report_publication('70000000-0000-0000-0000-000000001201',true)$$,'explicit report publication');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is(public.analytics_projects('2026-09-01','2026-09-30')->>'total','3','PM sees only three explicitly assigned projects including fixture');
select throws_ok($$select public.analytics_work('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000000b1')$$,'42501','analytics_scope_forbidden','PM foreign organization denied');
select throws_ok($$select public.analytics_work('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000000a3')$$,'42501','analytics_scope_forbidden','PM foreign project same organization denied');
select throws_ok($$select public.analytics_work('2026-09-01','2026-09-30',p_organization=>'30000000-0000-0000-0000-00000000000b')$$,'42501','analytics_scope_forbidden','foreign organization total cannot be inferred');
select throws_ok($$select public.analytics_billing('2026-09-01','2026-09-30')$$,'42501','analytics_billing_forbidden','PM does not automatically get financial analytics');
select throws_ok($$select public.export_analytics('work','2026-09-01','2026-09-30')$$,'42501','analytics_export_forbidden','export capability separate');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.analytics_work('2026-09-01','2026-09-30')$$,'42501','analytics_forbidden','Contributor operational analytics denied by default');
select throws_ok($$select public.analytics_billing('2026-09-01','2026-09-30')$$,'42501','analytics_forbidden','Contributor financial analytics denied');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is(public.list_project_reports()->>'total','1','client lists only published assigned report');
select is(public.client_project_report('70000000-0000-0000-0000-000000001201')->>'published_deliverables','1','client-safe published count');
select ok(not (public.client_project_report('70000000-0000-0000-0000-000000001201') ?| array['work','billing','internal_reviews','created_by','assignees','pipeline']),'safe report excludes internal/financial identity fields');
select throws_ok($$select public.analytics_work('2026-09-01','2026-09-30')$$,'42501','analytics_forbidden','client internal aggregate attack denied');
select throws_ok($$select public.set_project_report_publication('70000000-0000-0000-0000-000000001201',false)$$,'42501','report_publish_forbidden','client cannot alter publication');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000008',true);
select is(public.list_project_reports()->>'total','0','client B cannot infer report A');
select throws_ok($$select public.client_project_report('70000000-0000-0000-0000-000000001201')$$,'42501','report_forbidden','foreign report UUID denied');

reset role;
update public.project_reports set published_at=null,published_by=null where id='70000000-0000-0000-0000-000000001201';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is(public.list_project_reports()->>'total','0','unpublished report hidden');
select throws_ok($$select public.client_project_report('70000000-0000-0000-0000-000000001201')$$,'42501','report_forbidden','unpublished report direct call denied');

reset role;
-- Extra financial capability still cannot expand a PM's Project membership.
insert into public.capability_grants(user_id,agency_id,capability_key,scope_kind,organization_id,reason)
select '10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',cap,'organization','30000000-0000-0000-0000-00000000000a','analytics test'
from (values('analytics.view_billing'),('billing.view')) x(cap);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000012a1')$$,'explicit financial grant works inside PM scope');
select throws_ok($$select public.analytics_billing('2026-09-01','2026-09-30',p_project=>'60000000-0000-0000-0000-0000000000a3')$$,'42501','analytics_scope_forbidden','financial Organization grant does not imply foreign Project access');
reset role;
update public.billing_documents set published_to_client=true,published_at=now() where id='69000000-0000-0000-0000-000000001201';
insert into public.billing_documents(organization_id,project_id,status,date,currency,subtotal_amount,total_amount,published_to_client,published_at) values
 ('30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000000a3','issued','2026-09-10','MXN',100,100,true,now());
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.client_billing_projections where project_id='60000000-0000-0000-0000-0000000000a3'),0::bigint,'legacy financial projection now requires explicit Project membership');
select is((select count(*) from public.client_billing_projections where id='69000000-0000-0000-0000-000000001201'),1::bigint,'legacy projection retains authorized document');
select is((select total_paid from public.client_billing_projections where id='69000000-0000-0000-0000-000000001201'),5000::numeric,'safe financial facade still derives exact payments');
reset role;
delete from public.role_capabilities where role_key='project_manager' and capability_key='analytics.view';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.analytics_work('2026-09-01','2026-09-30')$$,'42501','analytics_forbidden','PM without capability denied');

select * from finish();
rollback;
