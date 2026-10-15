begin;
select no_plan();

select is((select context from public.roles where key='developer'),'agency','Developer is an independent agency role');
select is(public.authorization_role('developer'),'agency_director','Developer uses the canonical Boss authority');
select is(public.authorization_role('project_manager'),'project_manager','PM authority is unchanged');
select is(public.authorization_role('contributor'),'contributor','Contributor authority is unchanged');
select is(public.authorization_role('client_admin'),'client_admin','Client authority is unchanged');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
create temp table boss_capabilities as select * from public.my_capabilities();
create temp table boss_project_access as
select p.id,c.key,app_private.project_permission(p.id,c.key) allowed
from public.projects p cross join public.capabilities c;
create temp table boss_automation_access as
select p.id,c.key,app_private.p13_permission(p.id,auth.uid(),c.key) allowed
from public.projects p cross join public.capabilities c where c.key like 'automation.%' or c.key like 'integration.%' or c.key like 'ai.%';
create temp table boss_channel_access as select id,app_private.channel_access(id,auth.uid()) allowed from public.channels;
set local role authenticated;
select set_config('ux.boss_pipeline_count',(select count(*)::text from public.pipeline_stages),true);
reset role;

update public.agency_memberships set role_key='developer' where user_id=auth.uid();
select is((select role_key from public.agency_memberships where user_id=auth.uid()),'developer','Membership retains Developer identity');
select results_eq('select * from public.my_capabilities() order by 1,2,3','select * from boss_capabilities order by 1,2,3','All effective capabilities and scopes equal Boss');
select results_eq('select p.id,c.key,app_private.project_permission(p.id,c.key) from public.projects p cross join public.capabilities c order by 1,2','select * from boss_project_access order by 1,2','Every project and capability decision equals Boss');
select results_eq($$select p.id,c.key,app_private.p13_permission(p.id,auth.uid(),c.key) from public.projects p cross join public.capabilities c where c.key like 'automation.%' or c.key like 'integration.%' or c.key like 'ai.%' order by 1,2$$,'select * from boss_automation_access order by 1,2','Automation, Integration and AI scopes equal Boss');
select results_eq('select id,app_private.channel_access(id,auth.uid()) from public.channels order by 1','select * from boss_channel_access order by 1','Messaging access equals Boss');

insert into public.agencies(id,name) values('20000000-0000-0000-0000-00000000d002','UX isolated Agency B');
insert into public.organizations(id,agency_id,name,lifecycle) values('30000000-0000-0000-0000-00000000d002','20000000-0000-0000-0000-00000000d002','UX foreign organization','active_client');
select ok(not public.has_capability('organization.view','20000000-0000-0000-0000-00000000d002','30000000-0000-0000-0000-00000000d002'),'Developer cannot cross Agency boundary');
set local role authenticated;
select is((select count(*) from public.pipeline_stages),current_setting('ux.boss_pipeline_count')::bigint,'Direct RLS pipeline stages equal Boss');
select ok((select count(*) from public.pipeline_stages)>0,'Developer receives actual stage options');
select is((select count(*) from public.organizations where id='30000000-0000-0000-0000-00000000d002'),0::bigint,'RLS hides a different Agency from Developer');
select lives_ok($$select * from public.create_invitation('internal','ux.developer.invite@omnia.local','developer','AXIS','employee')$$,'Developer can invite another Developer with Boss department rules');
select throws_ok($$select * from public.create_invitation('client','ux.foreign.invite@omnia.local',null,null,null,'30000000-0000-0000-0000-00000000d002','client_viewer')$$,'42501','client_invitation_forbidden','Developer cannot invite a client across Agencies');
reset role;
select is((select agency_role_key from public.invitations where email='ux.developer.invite@omnia.local'),'developer','Invitation preserves real Developer identity');

select ok((select relrowsecurity from pg_class where oid='public.user_drafts'::regclass),'Private drafts have RLS');
select ok(not has_table_privilege('anon','public.user_drafts','select'),'Anonymous cannot read drafts');
select ok(not has_table_privilege('authenticated','public.user_drafts','insert'),'Direct draft writes are denied');
select ok(not has_function_privilege('anon','public.save_user_draft(uuid,text,uuid,text,jsonb,bigint)','execute'),'Anonymous cannot call draft RPC');
select ok(not has_function_privilege('authenticated','app_private.cleanup_expired_drafts()','execute'),'Draft cleanup is not exposed to application actors');

set local role authenticated;
select lives_ok($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security','{"title":"Private draft"}',0)$$,'Authorized Developer saves its own scoped draft');
select lives_ok($$select public.save_user_draft(auth.uid(),'project','20000000-0000-0000-0000-000000000001','project-security','{"brandId":"31000000-0000-0000-0000-0000000000a1","name":"Private project"}',0)$$,'Project draft validates selected brand within its Agency');
select throws_ok($$select public.save_user_draft(auth.uid(),'project','20000000-0000-0000-0000-000000000001','foreign-brand','{"brandId":"31000000-0000-0000-0000-00000000d002"}',0)$$,'42501','draft_scope_denied','Project draft cannot smuggle an unauthorized brand');
select is((select body->>'title' from public.user_drafts where draft_key='ux-security'),'Private draft','Owner can restore its draft');
select throws_ok($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security','{"title":"Old tab"}',0)$$,'40001','draft_revision_conflict','Stale tab cannot overwrite a draft');
select throws_ok($$select public.save_user_draft('10000000-0000-0000-0000-000000000003','work','60000000-0000-0000-0000-0000000000a1','ux-security','{"title":"Other actor"}',0)$$,'42501','draft_scope_denied','Owner spoofing is denied');
select throws_ok($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-secret','{"password":"forbidden"}',0)$$,'22023','draft_secret_field_forbidden','Secret fields cannot enter recovery persistence');
select lives_ok($$select public.clear_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security',1)$$,'Confirmed submission clears the draft with a new revision');
select throws_ok($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security','{"title":"Resurrect"}',1)$$,'40001','draft_revision_conflict','A stale tab cannot resurrect submitted content');
reset role;

update public.user_drafts set expires_at=now()-interval '1 second' where draft_key='ux-security';
create temp table expired_revision as select revision from public.user_drafts where draft_key='ux-security';
grant select on expired_revision to authenticated;
set local role authenticated;
select is((select count(*) from public.user_drafts where draft_key='ux-security'),0::bigint,'Expired draft content is unavailable even to owner');
select lives_ok($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security','{"title":"New session after expiry"}',0)$$,'A fresh form can save after expiration before cron runs');
select cmp_ok((select revision from public.user_drafts where draft_key='ux-security'),'>',(select revision from expired_revision),'A recreated draft never reuses an old revision');
select throws_ok(format($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security','{"title":"Ancient browser tab"}',%s)$$,(select revision from expired_revision)),'40001','draft_revision_conflict','An ancient tab cannot overwrite recreated content');
reset role;
update public.user_drafts set expires_at=now()-interval '1 second' where draft_key='ux-security';
select is(app_private.cleanup_expired_drafts(),1::bigint,'Private maintenance removes expired draft');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is((select count(*) from public.user_drafts where draft_key='ux-security'),0::bigint,'User switch never exposes another owner draft');
select throws_ok($$update public.agency_memberships set role_key='developer' where user_id=auth.uid()$$,'42501',null,'Contributor cannot self-promote');
select throws_ok($$select public.save_user_draft(auth.uid(),'automation','60000000-0000-0000-0000-0000000000a1','ux-security','{}',0)$$,'42501','draft_scope_denied','Contributor cannot acquire automation authority through drafts');
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
set local role authenticated;
select is((select count(*) from public.pipeline_stages),0::bigint,'Client cannot read internal pipeline stages');
select throws_ok($$select public.save_user_draft(auth.uid(),'work','60000000-0000-0000-0000-0000000000a1','ux-security','{}',0)$$,'42501','draft_scope_denied','Client cannot create internal work drafts');
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
update public.agency_memberships set status='suspended' where user_id=auth.uid();
select is((select count(*) from public.my_capabilities()),0::bigint,'Revoked Developer has no capabilities');
set local role authenticated;
select is((select count(*) from public.user_drafts where draft_key in ('ux-security','project-security')),0::bigint,'Revocation also revokes Work and Project draft access');
reset role;

select * from finish();
rollback;
