begin;

select no_plan();

select has_table('public', 'projects', 'projects exists');
select has_table('public', 'project_memberships', 'project memberships exist');
select has_table('public', 'milestones', 'milestones exist');
select has_table('public', 'work_items', 'canonical work items exist');
select has_table('public', 'work_item_assignees', 'work item assignees exist');
select has_table('public', 'work_item_comments', 'work item comments exist');
select has_table('public', 'work_item_events', 'contextual work events exist');
select has_table('public', 'personal_work_items', 'personal work is explicitly separate');
select has_column('public', 'projects', 'brand_id', 'Project owns only canonical Brand scope');
select hasnt_column('public', 'projects', 'organization_id', 'Project does not duplicate Organization scope');
select has_column('public', 'work_items', 'completed_at', 'work completion is server-derived');
select has_column('public', 'work_items', 'archived_at', 'work is archive-first');
select hasnt_column('public', 'personal_work_items', 'project_id', 'personal work cannot become Project work by mutation');
select hasnt_column('public', 'personal_work_items', 'assignee_id', 'personal work cannot assign another actor');
select has_index('public', 'projects', 'projects_brand_status_created_idx', 'Project list path is indexed');
select has_index('public', 'project_memberships', 'project_memberships_user_active_idx', 'Project scope lookup is indexed');
select has_index('public', 'work_items', 'work_items_project_due_idx', 'Project due work is indexed');
select has_index('public', 'work_item_assignees', 'work_item_assignees_user_active_idx', 'My Space assignment lookup is indexed');
select has_index('public', 'personal_work_items', 'personal_work_items_user_status_due_idx', 'personal My Space lookup is indexed');
select is((select count(*) from public.projects), 4::bigint, 'A1/A2/A3/B1 Project fixtures exist');
select is((select count(*) from public.project_memberships where member_type = 'client'), 3::bigint, 'client Project scope is explicit');
select is((select visibility from public.work_items limit 1), 'internal', 'work visibility remains internal-only in MVP');
select ok(not has_table_privilege('authenticated', 'public.projects', 'insert'), 'browser cannot directly create Projects');
select ok(not has_table_privilege('authenticated', 'public.project_memberships', 'insert'), 'browser cannot self-add Project membership');
select ok(not has_table_privilege('authenticated', 'public.work_item_assignees', 'update'), 'browser cannot directly change assignees');
select ok(not has_table_privilege('authenticated', 'public.work_items', 'update'), 'browser cannot move work across Projects');
select ok(not has_table_privilege('authenticated', 'public.work_item_comments', 'insert'), 'comments require the command deriving auth.uid()');
select ok(not has_table_privilege('authenticated', 'public.personal_work_items', 'insert'), 'personal writes use self-scoped commands');
select ok(not has_function_privilege('anon', 'public.create_work_item(uuid,text,text,text,timestamp without time zone,uuid,uuid[],uuid)', 'execute'), 'anonymous cannot create work');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($sql$ select * from public.projects $sql$, '42501', null, 'anonymous cannot enumerate Projects');
select throws_ok($sql$ select * from public.work_items $sql$, '42501', null, 'anonymous cannot enumerate work');
select throws_ok($sql$ select * from public.personal_work_items $sql$, '42501', null, 'anonymous cannot enumerate personal work');
select throws_ok($sql$ select * from public.client_project_context() $sql$, '42501', null, 'anonymous cannot call client Project projection');
reset role;

-- PM A is scoped only to Project A1/A2, despite Organization A CRM grants.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.projects), 2::bigint, 'PM A sees only Project A1/A2');
select ok(exists(select 1 from public.projects where id='60000000-0000-0000-0000-0000000000a1'), 'PM A sees Project A1');
select ok(exists(select 1 from public.projects where id='60000000-0000-0000-0000-0000000000a2'), 'PM A sees Project A2');
select ok(not exists(select 1 from public.projects where id='60000000-0000-0000-0000-0000000000a3'), 'PM A cannot see unassigned Project A3 in the same Organization');
select ok(not exists(select 1 from public.projects where id='60000000-0000-0000-0000-0000000000b1'), 'PM A cannot see Project B1');
select is((select count(*) from public.work_items), 4::bigint, 'PM A sees work only in A1/A2');
select throws_ok(
  $sql$ select public.add_project_member('60000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-000000000003','internal','lead','71000000-0000-0000-0000-000000000001') $sql$,
  '42501', 'project_member_manage_forbidden', 'PM cannot self-add to another Project'
);
select throws_ok(
  $sql$ select public.assign_work_item('63000000-0000-0000-0000-0000000000a1',array['10000000-0000-0000-0000-000000000011'::uuid],'71000000-0000-0000-0000-000000000002') $sql$,
  '22023', 'assignee_not_active_project_member', 'PM cannot assign a non-member or cross-Project actor'
);
select throws_ok(
  $sql$ update public.work_items set project_id='60000000-0000-0000-0000-0000000000a2' where id='63000000-0000-0000-0000-0000000000a1' $sql$,
  '42501', null, 'PM cannot move work by direct ownership mutation'
);
select throws_ok(
  $sql$ update public.projects set brand_id='31000000-0000-0000-0000-0000000000b1' where id='60000000-0000-0000-0000-0000000000a1' $sql$,
  '42501', null, 'PM cannot change indirect Organization scope through Brand'
);

-- PM B remains isolated in Organization B.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.projects), 1::bigint, 'PM B sees only one assigned Project');
select is((select id from public.projects), '60000000-0000-0000-0000-0000000000b1'::uuid, 'PM B sees only Project B1');

-- Contributor A only sees its Project and assigned work, and cannot assign.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.projects), 1::bigint, 'Contributor A sees only Project A1');
select is((select count(*) from public.work_items), 3::bigint, 'Contributor A sees only assigned A1 work');
select throws_ok(
  $sql$ select public.add_project_member('60000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000004','internal','member','71000000-0000-0000-0000-000000000003') $sql$,
  '42501', 'project_member_manage_forbidden', 'Contributor cannot self-add membership'
);
select throws_ok(
  $sql$ select public.assign_work_item('63000000-0000-0000-0000-0000000000a1',array['10000000-0000-0000-0000-000000000003'::uuid],'71000000-0000-0000-0000-000000000004') $sql$,
  '42501', 'work_assign_forbidden', 'Contributor cannot assign another actor'
);
select throws_ok(
  $sql$ insert into public.work_item_assignees(work_item_id,user_id,assigned_by) values('63000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004') $sql$,
  '42501', null, 'Contributor cannot change assignees directly'
);

-- Client Project projections are explicit and raw internal work stays empty.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.client_project_context()), 1::bigint, 'Client A1 has one explicit Project');
select is((select project_id from public.client_project_context()), '60000000-0000-0000-0000-0000000000a1'::uuid, 'Client A1 projection contains Project A1');
select is((select count(*) from public.projects), 0::bigint, 'Client A1 cannot read raw Projects');
select is((select count(*) from public.work_items), 0::bigint, 'Client A1 cannot read internal work in its Project');
select is((select count(*) from public.work_item_assignees), 0::bigint, 'Client A1 cannot read assignee data');
select is((select count(*) from public.work_item_comments), 0::bigint, 'Client A1 cannot read internal comments');
select is((select count(*) from public.work_item_events), 0::bigint, 'Client A1 cannot read internal work events');
select throws_ok(
  $sql$ select public.create_work_item('60000000-0000-0000-0000-0000000000a1','Client attack','', 'normal',null,null,'{}'::uuid[],'71000000-0000-0000-0000-000000000005') $sql$,
  '42501', 'work_create_forbidden', 'Client cannot create internal work'
);
select throws_ok(
  $sql$ select public.create_work_item_comment('63000000-0000-0000-0000-0000000000a1','Client attack','71000000-0000-0000-0000-000000000006') $sql$,
  '42501', 'work_comment_forbidden', 'Client cannot comment on internal work'
);
select throws_ok(
  $sql$ select public.add_project_member('60000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000005','client','client_member','71000000-0000-0000-0000-000000000007') $sql$,
  '42501', 'project_member_manage_forbidden', 'Client cannot add itself to another Project'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is((select project_id from public.client_project_context()), '60000000-0000-0000-0000-0000000000a3'::uuid, 'Client A2 sees only Project A3');
select is((select count(*) from public.work_items), 0::bigint, 'Client A2 cannot read A3 internal work');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000008', true);
select is((select project_id from public.client_project_context()), '60000000-0000-0000-0000-0000000000b1'::uuid, 'Client B sees only Project B1');
select is((select count(*) from public.client_project_context('60000000-0000-0000-0000-0000000000a1')), 0::bigint, 'Client B cannot request Project A1');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.client_project_context()), 0::bigint, 'Organization membership without Project membership grants no Project access');

-- Director and PM integration commands.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(public.has_capability('project.create','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a'), 'Director has explicit Project capability');
select set_config('test.phase4_project', public.create_project(
  '31000000-0000-0000-0000-0000000000a1','Phase 4 Command Project','Created in pgTAP','active',current_date,current_date+20,'America/Mexico_City','72000000-0000-0000-0000-000000000001'
)::text, true);
select is(
  public.create_project('31000000-0000-0000-0000-0000000000a1','Replay ignored','', 'planning',null,null,'','72000000-0000-0000-0000-000000000001'),
  current_setting('test.phase4_project')::uuid,
  'Project creation is idempotent'
);
select lives_ok(
  format('select public.add_project_member(%L,%L,%L,%L,%L)', current_setting('test.phase4_project'), '10000000-0000-0000-0000-000000000003','internal','lead','72000000-0000-0000-0000-000000000002'),
  'Director assigns PM to a new Project'
);
select lives_ok(
  format('select public.add_project_member(%L,%L,%L,%L,%L)', current_setting('test.phase4_project'), '10000000-0000-0000-0000-000000000004','internal','member','72000000-0000-0000-0000-000000000003'),
  'Director assigns Contributor to a new Project'
);
select set_config('test.phase4_milestone', public.create_milestone(
  current_setting('test.phase4_project')::uuid, 'Command milestone', 'Date-only milestone',
  current_date + 5, 10, '72000000-0000-0000-0000-000000000004'
)::text, true);
select ok(exists(select 1 from public.milestones where id=current_setting('test.phase4_milestone')::uuid), 'Director creates a milestone');
select throws_ok(
  $sql$ select public.add_project_member('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000008','client','client_member','72000000-0000-0000-0000-000000000005') $sql$,
  '22023', 'invalid_client_project_member', 'Director cannot cross Organization boundaries when adding a client'
);
select lives_ok(
  format('select public.archive_project(%L,%L)', current_setting('test.phase4_project'), '72000000-0000-0000-0000-000000000006'),
  'Director archives the command Project'
);
select throws_ok(
  format('select public.update_milestone(%L,%L,%L,current_date+7,%L,10)', current_setting('test.phase4_milestone'), 'Blocked update','', 'planned'),
  '42501', 'milestone_update_forbidden', 'milestones cannot be changed after Project archive'
);

-- PM creates, assigns, transitions, comments and archives within assigned Project.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('test.phase4_work', public.create_work_item(
  '60000000-0000-0000-0000-0000000000a1','Command work','Atomic create + assignment','urgent',
  (current_date + 2)::timestamp + time '11:00', '62000000-0000-0000-0000-0000000000a1',
  array['10000000-0000-0000-0000-000000000004'::uuid], '73000000-0000-0000-0000-000000000001'
)::text, true);
select is(
  public.create_work_item('60000000-0000-0000-0000-0000000000a1','Replay ignored','', 'low',null,null,'{}'::uuid[],'73000000-0000-0000-0000-000000000001'),
  current_setting('test.phase4_work')::uuid,
  'work creation is idempotent without duplicate side effects'
);
select is((select count(*) from public.work_item_assignees where work_item_id=current_setting('test.phase4_work')::uuid and revoked_at is null), 1::bigint, 'create_work_item assigns atomically');
select is((select count(*) from public.work_item_events where work_item_id=current_setting('test.phase4_work')::uuid), 2::bigint, 'create and initial assignment produce contextual events');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
  format('select public.transition_work_item(%L,%L,%L)', current_setting('test.phase4_work'), 'in_progress','73000000-0000-0000-0000-000000000002'),
  'assigned Contributor starts work'
);
select lives_ok(
  format('select public.create_work_item_comment(%L,%L,%L)', current_setting('test.phase4_work'), 'Contributor contextual comment','73000000-0000-0000-0000-000000000003'),
  'assigned Contributor comments'
);
select is((select author_id from public.work_item_comments where body='Contributor contextual comment'), '10000000-0000-0000-0000-000000000004'::uuid, 'comment author is derived from auth.uid()');
select lives_ok(
  format('select public.transition_work_item(%L,%L,%L)', current_setting('test.phase4_work'), 'done','73000000-0000-0000-0000-000000000004'),
  'assigned Contributor completes work'
);
select ok((select completed_at is not null from public.work_items where id=current_setting('test.phase4_work')::uuid), 'done derives completed_at server-side');
select lives_ok(
  format('select public.transition_work_item(%L,%L,%L)', current_setting('test.phase4_work'), 'in_progress','73000000-0000-0000-0000-000000000005'),
  'completed work can be reopened explicitly'
);
select ok((select completed_at is null from public.work_items where id=current_setting('test.phase4_work')::uuid), 'reopen clears completed_at server-side');
select lives_ok(
  format('select public.transition_work_item(%L,%L,%L)', current_setting('test.phase4_work'), 'todo','73000000-0000-0000-0000-000000000006'),
  'in-progress work can return to todo'
);
select throws_ok(
  format('select public.transition_work_item(%L,%L,%L)', current_setting('test.phase4_work'), 'done','73000000-0000-0000-0000-000000000007'),
  '22023', 'invalid_work_transition', 'invalid todo to done transition is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok(
  format('select public.archive_work_item(%L,%L)', current_setting('test.phase4_work'), '73000000-0000-0000-0000-000000000008'),
  'PM archives work through the command'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select throws_ok(
  format('select public.transition_work_item(%L,%L,%L)', current_setting('test.phase4_work'), 'in_progress','73000000-0000-0000-0000-000000000009'),
  '42501', 'work_transition_forbidden', 'archived work cannot transition'
);

-- Personal organization stays self-owned and appears in My Space without N+1.
select set_config('test.phase4_personal', public.create_personal_work_item(
  'todo','Private command todo','Never a Project assignment','high',(current_date + 4)::timestamp + time '09:30'
)::text, true);
select ok(exists(select 1 from public.personal_work_items where id=current_setting('test.phase4_personal')::uuid), 'Contributor creates own personal todo');
select lives_ok(
  format('select public.update_personal_work_item(%L,%L,%L,%L,%L,%L,null)', current_setting('test.phase4_personal'), 'note','Private edited note','Self edit','done','normal'),
  'Contributor edits and completes own personal item'
);
select ok((select completed_at is not null from public.personal_work_items where id=current_setting('test.phase4_personal')::uuid), 'personal completion derives completed_at');
select lives_ok(
  format('select public.archive_personal_work_item(%L)', current_setting('test.phase4_personal')),
  'Contributor archives own personal item'
);
select is((select count(*) from public.my_space_items() where item_kind='project'), 3::bigint, 'My Space contains only current assigned Project work');
select is((select count(*) from public.my_space_items() where item_kind='personal'), 2::bigint, 'My Space contains only current actor personal items');
select ok(exists(select 1 from public.my_space_items() where bucket='overdue'), 'My Space has overdue bucket');
select ok(exists(select 1 from public.my_space_items() where bucket='today'), 'My Space has today bucket');
select ok(exists(select 1 from public.my_space_items() where bucket='upcoming'), 'My Space has upcoming bucket');
select ok(exists(select 1 from public.my_space_items() where bucket='no_due_date'), 'My Space has no due date bucket');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select is((select count(*) from public.personal_work_items where id='66000000-0000-0000-0000-0000000000a1'), 0::bigint, 'Contributor B cannot read Contributor A personal items');
select throws_ok(
  $sql$ select public.update_personal_work_item('66000000-0000-0000-0000-0000000000a1','todo','Attack','','open','normal',null) $sql$,
  '42501', 'personal_work_update_forbidden', 'Contributor cannot edit another user personal item'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.personal_work_items), 0::bigint, 'Client cannot read internal personal items');
select throws_ok(
  $sql$ select public.create_personal_work_item('todo','Client personal attack','','normal',null) $sql$,
  '42501', 'personal_work_create_forbidden', 'Client cannot create internal personal work'
);

-- Revocation immediately removes Project and My Space work while preserving rows/history.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $sql$ select public.revoke_project_member('61000000-0000-0000-0000-0000000000a2','74000000-0000-0000-0000-000000000001') $sql$,
  'Director revokes Contributor A membership'
);
select is((select status from public.project_memberships where id='61000000-0000-0000-0000-0000000000a2'), 'revoked', 'membership history is preserved as revoked');
select ok(exists(select 1 from public.work_item_comments where id='65000000-0000-0000-0000-0000000000a1'), 'revocation preserves historical comments');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select ok(not exists(select 1 from public.projects where id='60000000-0000-0000-0000-0000000000a1'), 'revoked Project disappears immediately');
select is((select count(*) from public.my_space_items() where item_kind='project'), 0::bigint, 'revoked Project work disappears from My Space');
select is((select count(*) from public.my_space_items() where item_kind='personal'), 2::bigint, 'personal items remain after Project revocation');

-- Hard delete paths remain unavailable.
select throws_ok(
  $sql$ delete from public.projects where id='60000000-0000-0000-0000-0000000000a1' $sql$,
  '42501', null, 'Project hard delete is unavailable'
);
select throws_ok(
  $sql$ delete from public.work_items where id='63000000-0000-0000-0000-0000000000a1' $sql$,
  '42501', null, 'work hard delete is unavailable'
);

reset role;
select * from finish();
rollback;
