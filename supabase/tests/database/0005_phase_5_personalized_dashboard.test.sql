begin;

select no_plan();

select has_table('public', 'dashboard_user_configs', 'personal dashboard override exists');
select has_column('public', 'dashboard_user_configs', 'revision', 'dashboard stores a CAS revision');
select has_pk('public', 'dashboard_user_configs', 'one dashboard row per user is enforced');
select ok(has_table_privilege('authenticated', 'public.dashboard_user_configs', 'select'), 'authenticated actor can select through RLS');
select ok(not has_table_privilege('authenticated', 'public.dashboard_user_configs', 'insert'), 'browser cannot insert preferences directly');
select ok(not has_table_privilege('authenticated', 'public.dashboard_user_configs', 'update'), 'browser cannot update preferences directly');
select ok(not has_table_privilege('authenticated', 'public.dashboard_user_configs', 'delete'), 'browser cannot delete preferences directly');
select ok(not has_function_privilege('anon', 'public.save_dashboard_config(bigint,integer,jsonb,jsonb)', 'execute'), 'anonymous cannot save a dashboard');
select ok(not has_function_privilege('anon', 'public.dashboard_operational_summary(integer)', 'execute'), 'anonymous cannot query the internal summary');
select ok(not has_function_privilege('authenticated', 'app_private.validate_dashboard_config(integer,jsonb,jsonb)', 'execute'), 'strict validator stays private');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $sql$ select * from public.save_dashboard_config(
    0, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb
  ) $sql$,
  'contributor saves a valid self-owned dashboard'
);
select is((select revision from public.dashboard_user_configs), 1::bigint, 'first save starts at revision one');

select lives_ok(
  $sql$ select * from public.save_dashboard_config(
    1, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000001","x":3,"y":0,"w":3,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000001","x":3,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb
  ) $sql$,
  'valid layout change increments through CAS'
);
select is((select revision from public.dashboard_user_configs), 2::bigint, 'revision increments atomically');
select throws_ok(
  $sql$ select * from public.save_dashboard_config(
    1, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb
  ) $sql$,
  '40001', 'dashboard_revision_conflict', 'stale session cannot overwrite newer layout'
);

select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 2, '[]'::jsonb, '{"desktop":[],"tablet":[],"mobile":[]}'::jsonb) $sql$,
  '22023', 'invalid_dashboard_registry_version', 'unsupported registry version is rejected'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000002","widgetKey":"future-widget","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[],"tablet":[],"mobile":[]}'::jsonb) $sql$,
  '22023', 'unknown_dashboard_widget', 'unknown widget injection is rejected'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000002","widgetKey":"crm-opportunities","widgetVersion":1,"config":{"maxItems":4},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000002","x":0,"y":0,"w":3,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000002","x":0,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000002","x":0,"y":0,"w":1,"h":2}]}'::jsonb) $sql$,
  '42501', 'dashboard_widget_forbidden', 'contributor cannot inject a CRM widget'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{"prototype":"polluted"},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb) $sql$,
  '22023', 'invalid_dashboard_widget_config', 'unexpected config keys are rejected'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000001","x":-1,"y":0,"w":3,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb) $sql$,
  '22023', 'dashboard_layout_out_of_bounds', 'negative layout coordinates are rejected'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":12,"h":2}],"tablet":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":3,"h":2}],"mobile":[{"i":"81000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb) $sql$,
  '22023', 'unsupported_dashboard_widget_size', 'oversized widget is rejected'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    '[{"instanceId":"81000000-0000-4000-8000-000000000001","widgetKey":"quick-actions","widgetVersion":1,"config":{},"enabled":true}]'::jsonb,
    '{"desktop":[],"tablet":[],"mobile":[],"watch":[]}'::jsonb) $sql$,
  '22023', 'invalid_dashboard_breakpoints', 'unsupported breakpoint injection is rejected'
);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(2, 1,
    (select jsonb_agg(jsonb_build_object('instanceId', format('81000000-0000-4000-8000-%012s', n), 'widgetKey', 'quick-actions', 'widgetVersion', 1, 'config', '{}'::jsonb, 'enabled', true)) from generate_series(1,13) n),
    '{"desktop":[],"tablet":[],"mobile":[]}'::jsonb) $sql$,
  '22023', 'dashboard_widget_limit_exceeded', 'more than twelve instances are rejected before parsing'
);

select lives_ok($sql$ select public.dashboard_operational_summary(6) $sql$, 'contributor can load bounded Work and Project summary');
select throws_ok($sql$ select public.dashboard_crm_summary(6) $sql$, '42501', 'dashboard_crm_forbidden', 'contributor cannot query CRM dashboard data');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $sql$ select * from public.save_dashboard_config(
    0, 1,
    '[{"instanceId":"82000000-0000-4000-8000-000000000001","widgetKey":"crm-opportunities","widgetVersion":1,"config":{"maxItems":4},"enabled":true}]'::jsonb,
    '{"desktop":[{"i":"82000000-0000-4000-8000-000000000001","x":0,"y":0,"w":6,"h":3}],"tablet":[{"i":"82000000-0000-4000-8000-000000000001","x":0,"y":0,"w":6,"h":3}],"mobile":[{"i":"82000000-0000-4000-8000-000000000001","x":0,"y":0,"w":1,"h":2}]}'::jsonb
  ) $sql$,
  'scoped PM can save an authorized CRM widget'
);
select lives_ok($sql$ select public.dashboard_crm_summary(4) $sql$, 'scoped PM can load the CRM summary');
select is((select count(*) from public.dashboard_user_configs), 1::bigint, 'RLS reveals only the PM own row');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.dashboard_user_configs), 1::bigint, 'RLS reveals only the contributor own row');
select is((select revision from public.dashboard_user_configs), 2::bigint, 'contributor cannot observe PM revision');
select lives_ok($sql$ select public.reset_dashboard_config(2) $sql$, 'contributor resets only its own override');
select is((select count(*) from public.dashboard_user_configs), 0::bigint, 'contributor sees no override after reset');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $sql$ select * from public.save_dashboard_config(0, 1, '[]'::jsonb, '{"desktop":[],"tablet":[],"mobile":[]}'::jsonb) $sql$,
  '42501', 'dashboard_actor_forbidden', 'client context cannot create an internal dashboard'
);
select is((select count(*) from public.dashboard_user_configs), 0::bigint, 'client cannot read internal dashboard rows');

reset role;
select * from finish();
rollback;
