import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const query=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input,encoding:'utf8'}).trim()
const setup=`begin;insert into public.billing_documents(organization_id,project_id,created_at)
 select '30000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-0000000000a1',now()-n*interval '1 second' from generate_series(1,2000)n;
 analyze public.billing_documents;`
const plan=`set local role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 explain(analyze,buffers,format json) select id,status,total_amount,created_at from public.billing_documents order by created_at desc,id desc limit 25;`
function measure(index) {
 const output=query(setup+(index?'create index phase15_candidate_billing_order on public.billing_documents(created_at desc,id desc);':'')+plan+'rollback;')
 return JSON.parse(output.slice(output.indexOf('[\n'),output.lastIndexOf(']')+1))[0]
}
const before=measure(false),after=measure(true)
const result={dataset:'2000 local synthetic draft invoices; one assigned project; rollback after each measurement',query:'Billing stable 25-row page',before,after,index:'billing_documents(created_at DESC,id DESC)',improvementPercent:100*(before['Execution Time']-after['Execution Time'])/before['Execution Time']}
writeFileSync('artifacts/phase-15/billing-load.json',JSON.stringify(result,null,2))
console.log(JSON.stringify({beforeMs:before['Execution Time'],afterMs:after['Execution Time'],improvementPercent:result.improvementPercent,beforeNode:before.Plan['Node Type'],afterNode:after.Plan.Plans[0]['Node Type']},null,2))
