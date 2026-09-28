begin;
select plan(18);

-- 1. Schema tests
select has_table('public', 'billing_documents', 'billing_documents table exists');
select has_table('public', 'payment_schedules', 'payment_schedules table exists');
select has_table('public', 'billing_document_items', 'billing_document_items table exists');
select has_table('public', 'payment_records', 'payment_records table exists');
select has_table('public', 'billing_document_files', 'billing_document_files table exists');
select has_view('public', 'client_billing_projections', 'client_billing_projections view exists');

select has_column('public', 'billing_documents', 'id', 'billing_documents has id');
select has_column('public', 'billing_documents', 'number', 'billing_documents has number');
select has_column('public', 'billing_documents', 'status', 'billing_documents has status');

-- 2. Constraints tests
select col_is_pk('public', 'billing_documents', 'id', 'billing_documents pk is id');
select col_has_default('public', 'billing_documents', 'subtotal_amount', 'subtotal_amount has default');

-- 3. Capability mappings tests
select isnt_empty(
  $$ select 1 from public.capabilities where key = 'billing.create' $$,
  'Capability billing.create exists'
);

select isnt_empty(
  $$ select 1 from public.role_capabilities where role_key = 'agency_director' and capability_key = 'billing.create' $$,
  'Agency director has billing.create capability'
);

select is_empty(
  $$ select 1 from public.role_capabilities where role_key = 'project_manager' and capability_key = 'billing.create' $$,
  'Project manager does NOT have global billing.create capability'
);

-- Enums
select has_enum('billing_document_type');
select has_enum('billing_document_status');
select has_enum('payment_method');
select has_enum('payment_schedule_type');

select * from finish();
rollback;
