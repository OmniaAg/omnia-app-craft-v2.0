begin;
select no_plan();
select has_table('public','file_assets','canonical file metadata exists');
select has_table('public','project_files','Project links exist');
select has_table('public','content_asset_links','Editorial links exist');
select has_table('public','deliverable_files','immutable Version links exist');
select is((select public from storage.buckets where id='project-files'),false,'sensitive bucket is private');
select is((select file_size_limit from storage.buckets where id='project-files'),52428800::bigint,'bucket has a size limit');
select ok(not has_table_privilege('authenticated','public.file_assets','insert'),'browser cannot forge asset metadata');
select ok(not has_table_privilege('authenticated','public.file_assets','update'),'browser cannot rewrite asset scope or status');
select ok(not has_table_privilege('authenticated','public.deliverable_files','insert'),'browser cannot attach files after submission');
select ok(not has_table_privilege('authenticated','public.deliverable_files','delete'),'browser cannot unlink history');
select ok(not has_function_privilege('anon','public.prepare_file_asset(uuid,text,text,bigint)','execute'),'anon cannot prepare upload');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects'
  and policyname='project_files_object_insert'),1::bigint,'Storage insert policy exists');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects'
  and policyname='project_files_object_read'),1::bigint,'Storage read policy exists');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects'
  and policyname='project_files_object_delete'),1::bigint,'Storage delete policy exists');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects'
  and cmd='UPDATE' and policyname like 'project_files%'),0::bigint,'no asset overwrite policy exists');

insert into public.capability_grants(user_id,agency_id,capability_key,scope_kind,granted_by,reason)
select '10000000-0000-0000-0000-000000000003',o.agency_id,'file.delete_permanently','agency',
 '10000000-0000-0000-0000-000000000001','Director-only file delete adversarial test'
from public.projects p join public.brands b on b.id=p.brand_id
join public.organizations o on o.id=b.organization_id
where p.id='60000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select ok(public.project_access_allowed('60000000-0000-0000-0000-0000000000a1','file.delete_permanently'),
 'PM has adversarial explicit delete grant');
select ok(not public.file_director_access_allowed('60000000-0000-0000-0000-0000000000a1'),
 'explicit grant cannot turn PM into Director for permanent delete');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($sql$ select public.prepare_file_asset('60000000-0000-0000-0000-0000000000a1','../evil.pdf','application/pdf',12) $sql$,
 '42501','file_prepare_forbidden','path traversal filename rejected');
select throws_ok($sql$ select public.prepare_file_asset('60000000-0000-0000-0000-0000000000a1','evil.exe','application/pdf',12) $sql$,
 '42501','file_prepare_forbidden','extension mismatch rejected');
select throws_ok($sql$ select public.prepare_file_asset('60000000-0000-0000-0000-0000000000b1','safe.pdf','application/pdf',12) $sql$,
 '42501','file_prepare_forbidden','cross-project upload denied');
select set_config('test.phase8_pending',(public.prepare_file_asset('60000000-0000-0000-0000-0000000000a1','safe.pdf','application/pdf',12)).id::text,true);
select is((select status from public.file_assets where id=current_setting('test.phase8_pending')::uuid),'pending','prepare does not mark ready');
select throws_ok($sql$ select public.finalize_file_asset(current_setting('test.phase8_pending')::uuid) $sql$,
 '22023','file_object_mismatch','missing Storage object cannot finalize');
select ok(not public.file_object_insert_allowed('project-files','60000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-000000000000'),
 'arbitrary object path rejected');
select ok(not public.file_object_read_allowed('project-files',(select object_path from public.file_assets where id=current_setting('test.phase8_pending')::uuid)),
 'pending object not readable');
select throws_ok($sql$ update public.file_assets set status='ready' where id=current_setting('test.phase8_pending')::uuid $sql$,
 '42501',null,'browser cannot mark pending asset ready');
reset role;
select * from finish();
rollback;
