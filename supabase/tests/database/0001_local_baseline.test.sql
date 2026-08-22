begin;

select plan(7);

select ok(
  to_regnamespace('app_private') is not null,
  'app_private schema exists'
);

select ok(
  not has_schema_privilege('anon', 'app_private', 'usage'),
  'anon cannot use app_private'
);

select ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'authenticated cannot use app_private'
);

select function_returns(
  'public',
  'health_check',
  array[]::text[],
  'jsonb',
  'health_check returns jsonb'
);

select ok(
  has_function_privilege('anon', 'public.health_check()', 'execute'),
  'anon can execute the non-sensitive health check'
);

select ok(
  has_function_privilege('authenticated', 'public.health_check()', 'execute'),
  'authenticated can execute the non-sensitive health check'
);

select is(
  public.health_check(),
  jsonb_build_object('status', 'ok'),
  'health_check reports ok'
);

select * from finish();
rollback;
