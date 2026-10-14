begin;
select no_plan();
create temporary table p13_fixture(key text primary key,id uuid);
grant all on p13_fixture to authenticated,service_role;
-- Explicit scopes: role alone grants none of Phase 13 to PM/Contributor/Client.
insert into public.capability_grants(user_id,agency_id,capability_key,scope_kind,organization_id,granted_by,reason)
 select '10000000-0000-0000-0000-000000000003',o.agency_id,c.key,'organization',o.id,
 '10000000-0000-0000-0000-000000000001','Phase 13 scoped test' from public.organizations o cross join public.capabilities c
 where o.id='30000000-0000-0000-0000-00000000000a' and c.key in ('automation.view','automation.manage','automation.run','integration.view','ai.use');
insert into public.capability_grants(user_id,agency_id,capability_key,scope_kind,organization_id,granted_by,reason)
 select '10000000-0000-0000-0000-000000000004',o.agency_id,'ai.use','organization',o.id,
 '10000000-0000-0000-0000-000000000001','Phase 13 contributor test' from public.organizations o where o.id='30000000-0000-0000-0000-00000000000a';

select has_table('public','integration_connections','connection metadata exists');
select has_table('app_private','integration_credentials','credentials are private');
select has_table('public','automation_runs','event-backed run queue exists');
select has_table('public','automation_run_steps','ordered steps exist');
select has_table('public','ai_runs','AI provenance exists');
select has_table('public','webhook_deliveries','external delivery ledger exists');
select ok(not has_table_privilege('authenticated','app_private.integration_credentials','select'),'browser cannot read encrypted secrets');
select ok(not has_function_privilege('authenticated','public.phase13_store_credentials(uuid,uuid,text,jsonb,uuid)','execute'),'browser cannot write ciphertext');
select ok(not has_function_privilege('authenticated','public.phase13_delivery_material(uuid,uuid,uuid,uuid)','execute'),'browser cannot download credentials via RPC');
select ok(not has_function_privilege('authenticated','public.phase13_start_ai(uuid,uuid,text,uuid)','execute'),'browser cannot forge AI actor/provider');
select ok(not has_function_privilege('authenticated','public.phase13_complete_ai(uuid,uuid,jsonb,text,integer,integer)','execute'),'browser cannot forge AI result/usage');
select ok(not has_function_privilege('authenticated','public.phase13_claim_run(uuid)','execute'),'browser cannot claim a run');
select ok(not has_function_privilege('anon','public.phase13_projects(text)','execute'),'anonymous cannot list projects');
select ok(not has_table_privilege('authenticated','public.automation_runs','insert'),'browser cannot insert a succeeded run');
select ok(not has_table_privilege('authenticated','public.webhook_deliveries','update'),'browser cannot mark a delivery delivered');
select ok(not has_column_privilege('authenticated','public.automation_runs','claim_token','select'),'browser cannot steal a claim');
select ok(not has_table_privilege('authenticated','public.ai_runs','update'),'browser cannot change result/actor');
select ok(not has_function_privilege('authenticated','app_private.p13_permission(uuid,uuid,text)','execute'),'private actor check cannot be called');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select ok(public.phase13_access('60000000-0000-0000-0000-0000000000a1','automation.manage'),'Director can configure');
select ok(public.phase13_access('60000000-0000-0000-0000-0000000000a1','integration.manage'),'Director can approve connections');
select lives_ok($$select public.phase13_ai_consent('60000000-0000-0000-0000-0000000000a1',true)$$,'Director grants per-project consent');
insert into p13_fixture values('connection',public.phase13_save_connection('60000000-0000-0000-0000-0000000000a1','Test endpoint',gen_random_uuid()));
select throws_ok($$select public.phase13_save_automation('60000000-0000-0000-0000-0000000000a1','Bad',true,'manual',null,'[]','[{"type":"sql","sql":"delete"}]',gen_random_uuid())$$,'22023','action_not_allowlisted','arbitrary action rejected');
select throws_ok($$select public.phase13_save_automation('60000000-0000-0000-0000-0000000000a1','Bad',true,'manual',null,'[{"field":"secret","operator":"equals","value":"x"}]','[{"type":"create_work_item","title":"Safe","priority":"normal"}]',gen_random_uuid())$$,'22023','invalid_condition','condition fields allowlisted');
select throws_ok($$select public.phase13_save_automation('60000000-0000-0000-0000-0000000000a1','Bad',true,'manual',null,'[]','[{"type":"create_work_item","title":"Safe","priority":"normal","project_id":"60000000-0000-0000-0000-0000000000b1"}]',gen_random_uuid())$$,'22023','invalid_work_action','forged action scope rejected');
insert into p13_fixture values('automation',public.phase13_save_automation('60000000-0000-0000-0000-0000000000a1','Self loop',true,'domain_event','work.created','[]','[{"type":"create_work_item","title":"Scoped follow-up","priority":"normal"}]',gen_random_uuid()));
insert into p13_fixture values('disabled',public.phase13_save_automation('60000000-0000-0000-0000-0000000000a1','Disabled',false,'domain_event','work.created','[]','[{"type":"create_work_item","title":"Never","priority":"normal"}]',gen_random_uuid()));
insert into p13_fixture values('condition',public.phase13_save_automation('60000000-0000-0000-0000-0000000000a1','Condition mismatch',true,'domain_event','work.created','[{"field":"status","operator":"equals","value":"done"}]','[{"type":"create_work_item","title":"Never","priority":"normal"}]',gen_random_uuid()));
insert into p13_fixture values('manual',public.phase13_manual_run((select id from p13_fixture where key='automation'),gen_random_uuid()));
select throws_ok($$select public.phase13_manual_run((select id from p13_fixture where key='disabled'),gen_random_uuid())$$,'22023','automation_disabled','disabled run denied');
select throws_ok($$select public.phase13_retry_run((select id from p13_fixture where key='manual'))$$,'22023','retry_not_allowed','cannot retry pending run');
select throws_ok($$update public.automation_definitions set created_by='10000000-0000-0000-0000-000000000004'$$,'42501',null,'cannot forge owner');
select throws_ok($$update public.integration_connections set project_id='60000000-0000-0000-0000-0000000000b1'$$,'42501',null,'cannot change connection scope');
select is(public.phase13_history('60000000-0000-0000-0000-0000000000a1','automations')->>'total','3','safe paginated history');
select throws_ok($$select public.phase13_history('60000000-0000-0000-0000-0000000000a1','runs',100,0)$$,'22023','invalid_page','oversized history rejected');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select ok(not public.phase13_access('60000000-0000-0000-0000-0000000000a1','automation.manage'),'PM without explicit capability denied');
select is((select count(*) from public.automation_definitions),0::bigint,'PM without capability sees no definitions');
select throws_ok($$select public.phase13_manual_run((select id from p13_fixture where key='automation'),gen_random_uuid())$$,'42501','automation_forbidden','foreign run denied');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select ok(public.phase13_access('60000000-0000-0000-0000-0000000000a1','automation.manage'),'scoped PM can configure Project A');
select ok(not public.phase13_access('60000000-0000-0000-0000-0000000000b1','automation.manage'),'scoped PM cannot configure Project B');
select ok(not public.phase13_access('60000000-0000-0000-0000-0000000000a1','integration.manage'),'PM cannot manage external secrets');
select throws_ok($$select public.phase13_history('60000000-0000-0000-0000-0000000000b1','runs')$$,'42501','history_forbidden','cross-project history denied');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select ok(public.phase13_access('60000000-0000-0000-0000-0000000000a1','ai.use'),'explicit contributor AI use');
select ok(not public.phase13_access('60000000-0000-0000-0000-0000000000a1','automation.manage'),'Contributor cannot configure workflows');
select ok(not public.phase13_access('60000000-0000-0000-0000-0000000000a1','integration.manage'),'Contributor cannot configure integrations');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.automation_runs),0::bigint,'Client cannot inspect internal runs');
select is((select count(*) from public.ai_runs),0::bigint,'Client cannot inspect AI runs');
select ok(not public.phase13_access('60000000-0000-0000-0000-0000000000a1','ai.use'),'Client AI denied');

reset role;
select set_config('request.jwt.claim.sub','',true);
insert into p13_fixture values('event',app_private.emit_event('work.created','10000000-0000-0000-0000-000000000001','project',
 '60000000-0000-0000-0000-0000000000a1',(select agency_id from public.organizations where id='30000000-0000-0000-0000-00000000000a'),
 '30000000-0000-0000-0000-00000000000a',gen_random_uuid(),null,'{}'));
select is((select count(*) from public.automation_runs where event_id=(select id from p13_fixture where key='event')),1::bigint,'event triggers only enabled matching condition');
select is(public.phase13_replay_event((select id from p13_fixture where key='event')),0,'same event replay is idempotent');
select is((select count(*) from public.automation_runs where automation_id=(select id from p13_fixture where key='disabled')),0::bigint,'disabled event definition has no run');
insert into p13_fixture values('foreign_event',app_private.emit_event('work.created','10000000-0000-0000-0000-000000000001','project',
 '60000000-0000-0000-0000-0000000000b1',(select agency_id from public.organizations where id='30000000-0000-0000-0000-00000000000b'),
 '30000000-0000-0000-0000-00000000000b',gen_random_uuid(),null,'{}'));
select is((select count(*) from public.automation_runs where event_id=(select id from p13_fixture where key='foreign_event')),0::bigint,'foreign Project event cannot trigger');
-- Claims and authoritative work effects can be checked without an external worker.
create temporary table p13_claim(value jsonb);
insert into p13_claim values(public.phase13_claim_run((select id from p13_fixture where key='manual')));
select ok((select value->>'token' is not null from p13_claim),'worker receives fenced claim');
select is(public.phase13_claim_run((select id from p13_fixture where key='manual')),null::jsonb,'second worker cannot claim the same run');
select throws_ok($$select public.phase13_prepare_step((select id from p13_fixture where key='manual'),gen_random_uuid(),0)$$,'42501','stale_claim','forged claim denied');
select lives_ok($$select public.phase13_prepare_step((select id from p13_fixture where key='manual'),(select (value->>'token')::uuid from p13_claim),0)$$,'work step executes via Phase 4 command');
select is((select count(*) from public.work_items where title='Scoped follow-up'),1::bigint,'one work effect');
select lives_ok($$select public.phase13_prepare_step((select id from p13_fixture where key='manual'),(select (value->>'token')::uuid from p13_claim),0)$$,'step replay is idempotent');
select is((select count(*) from public.work_items where title='Scoped follow-up'),1::bigint,'step replay does not duplicate work');
select is((select count(*) from public.automation_runs where causation_id=(select id from p13_fixture where key='manual')),0::bigint,'same automation self-trigger stops');
select ok(exists(select 1 from public.domain_events where origin_run_id=(select id from p13_fixture where key='manual') and automation_depth=1),'work event has explicit automation identity/depth');
select lives_ok($$select public.phase13_finish_run((select id from p13_fixture where key='manual'),(select (value->>'token')::uuid from p13_claim))$$,'worker completes run');
select is((select status from public.automation_runs where id=(select id from p13_fixture where key='manual')),'succeeded','run succeeded');

-- Minimum AI context, independent service boundary, invalid structured output.
create temporary table p13_ai(value jsonb);
insert into p13_ai values(public.phase13_start_ai('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','project_summary',gen_random_uuid()));
select ok((select value->'context' ? 'work_titles' from p13_ai),'AI receives only bounded authorized projection');
select ok(not (select value->'context' ? 'messages' from p13_ai),'AI context contains no messages');
select lives_ok($$select public.phase13_complete_ai((select (value->>'id')::uuid from p13_ai),'10000000-0000-0000-0000-000000000001','{"summary":"safe","open_work":1,"completed_work":0}')$$,'structured AI output persisted');
select is((select status from public.ai_runs where id=(select (value->>'id')::uuid from p13_ai)),'succeeded','AI success');
select throws_ok($$select public.phase13_start_ai('60000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000003','project_summary',gen_random_uuid())$$,'42501','ai_forbidden','AI foreign context rejected');
select throws_ok($$select public.phase13_start_ai('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000005','project_summary',gen_random_uuid())$$,'42501','ai_forbidden','Client service AI request rejected');
select throws_ok($$select public.phase13_start_ai('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','arbitrary_tool',gen_random_uuid())$$,'22023','invalid_ai_request','arbitrary AI task/tool denied');
delete from p13_ai;
insert into p13_ai values(public.phase13_start_ai('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','draft_work',gen_random_uuid()));
select lives_ok($$select public.phase13_complete_ai((select (value->>'id')::uuid from p13_ai),'10000000-0000-0000-0000-000000000001','{"title":"bad","description":"x","priority":"normal","tool":"delete"}')$$,'invalid output recorded safely');
select is((select status from public.ai_runs where id=(select (value->>'id')::uuid from p13_ai)),'failed','extra tool fields reject result');
select is((select safe_error from public.ai_runs where id=(select (value->>'id')::uuid from p13_ai)),'invalid_result','invalid result distinguished');
select ok(not exists(select 1 from public.audit_events where payload::text like '%ciphertext%' or payload::text like '%encrypted_secret%'),'audit contains no credential envelope');
select ok(not exists(select 1 from public.domain_events where payload::text like '%ciphertext%' or payload::text like '%encrypted_secret%'),'events contain no credential envelope');
-- No rate-limit service is needed: transaction locks serialize per-actor counters.
do $$ declare v jsonb; begin
 for i in 1..8 loop
  v:=public.phase13_start_ai('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','draft_work',gen_random_uuid());
  perform public.phase13_complete_ai((v->>'id')::uuid,'10000000-0000-0000-0000-000000000001',null,'provider_unavailable');
 end loop;
end; $$;
select throws_ok($$select public.phase13_start_ai('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','draft_work',gen_random_uuid())$$,'54000','rate_limited','AI per-minute limit enforced');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$ begin
 for i in 1..9 loop perform public.phase13_manual_run((select id from p13_fixture where key='automation'),gen_random_uuid()); end loop;
end; $$;
select throws_ok($$select public.phase13_manual_run((select id from p13_fixture where key='automation'),gen_random_uuid())$$,'54000','rate_limited','manual run per-minute limit enforced');
select * from finish();
rollback;
