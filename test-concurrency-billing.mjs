import postgres from 'postgres';
import { v4 as uuidv4 } from 'uuid';

const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

async function getInternalUser() {
  const users = await sql`
    select u.id, o.id as org_id 
    from auth.users u
    join public.profiles p on p.user_id = u.id
    join public.organization_members om on om.user_id = u.id
    join public.organizations o on o.id = om.organization_id
    where o.type = 'agency'
    limit 1
  `;
  return users[0];
}

async function runIssueTest(user) {
  const docId = uuidv4();
  await sql`
    insert into public.billing_documents (
      id, organization_id, type, status, subtotal_amount, tax_amount, total_amount, currency
    ) values (
      ${docId}, ${user.org_id}, 'invoice_like', 'draft', 1000, 0, 1000, 'MXN'
    )
  `;
  await sql`
    insert into public.billing_document_items (
      billing_document_id, description, quantity, unit_price, line_total
    ) values (
      ${docId}, 'Item 1', 1, 1000, 1000
    )
  `;

  const runSession = async (name) => {
    const s = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    try {
      await s`set request.jwt.claim.sub = ${user.id}`;
      await s`set role authenticated`;
      await s`select public.issue_billing_document(${docId}, null)`;
      return 'SUCCESS';
    } catch (e) {
      return `ERROR: ${e.message}`;
    } finally {
      await s.end();
    }
  };

  const [resA, resB] = await Promise.all([runSession('Session A'), runSession('Session B')]);

  const doc = await sql`select number, status from public.billing_documents where id = ${docId}`;
  const events = await sql`select id from public.domain_events where resource_id = ${docId} and event_type = 'billing.document.issued'`;

  const passed = resA.includes('SUCCESS') !== resB.includes('SUCCESS') && doc[0].status === 'issued' && events.length === 1;
  console.log('## Concurrent issue');
  console.log(passed ? 'PASS' : 'FAIL');
  console.log(`- Session A: ${resA}`);
  console.log(`- Session B: ${resB}`);
  console.log(`- final document number: ${doc[0].number}`);
  console.log(`- issue events: ${events.length}`);
  console.log(`- final state: ${doc[0].status}`);
  return passed;
}

async function runPaymentTest(user) {
  const docId = uuidv4();
  await sql`
    insert into public.billing_documents (
      id, organization_id, type, status, subtotal_amount, tax_amount, total_amount, currency
    ) values (
      ${docId}, ${user.org_id}, 'invoice_like', 'draft', 20000, 0, 20000, 'MXN'
    )
  `;
  await sql`
    insert into public.billing_document_items (
      billing_document_id, description, quantity, unit_price, line_total
    ) values (
      ${docId}, 'Item 1', 1, 20000, 20000
    )
  `;
  
  const s = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  await s`set request.jwt.claim.sub = ${user.id}`;
  await s`set role authenticated`;
  await s`select public.issue_billing_document(${docId}, null)`;
  await s.end();

  const runSession = async (amount) => {
    const s2 = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    try {
      await s2`set request.jwt.claim.sub = ${user.id}`;
      await s2`set role authenticated`;
      await s2`select public.record_payment(${docId}, ${amount}, 'transfer', now(), 'REF', 'note', null, null)`;
      return 'SUCCESS';
    } catch (e) {
      return `ERROR: ${e.message}`;
    } finally {
      await s2.end();
    }
  };

  const [resA, resB] = await Promise.all([runSession(7500), runSession(12500)]);

  const doc = await sql`select status, total_amount from public.billing_documents where id = ${docId}`;
  const payments = await sql`select id, amount from public.payment_records where billing_document_id = ${docId}`;
  
  const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount), 0);
  const remaining = Number(doc[0].total_amount) - totalPaid;

  const passed = resA === 'SUCCESS' && resB === 'SUCCESS' && totalPaid === 20000 && remaining === 0 && doc[0].status === 'paid';
  console.log('\n## Concurrent payments');
  console.log(passed ? 'PASS' : 'FAIL');
  console.log(`- Session A: ${resA}`);
  console.log(`- Session B: ${resB}`);
  console.log(`- payment records: ${payments.length}`);
  console.log(`- paid: ${totalPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
  console.log(`- remaining: ${remaining.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
  console.log(`- final state: ${doc[0].status}`);
  return passed;
}

async function main() {
  const user = await getInternalUser();
  const pass1 = await runIssueTest(user);
  const pass2 = await runPaymentTest(user);
  
  console.log('\n## Final');
  console.log(`Phase 11 concurrency: ${pass1 && pass2 ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 12 readiness: ${pass1 && pass2 ? 'READY' : 'NOT READY'}`);
  process.exit(0);
}

main().catch(console.error);
