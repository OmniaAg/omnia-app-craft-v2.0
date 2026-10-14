import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { TEST_PASSWORD } from './test-fixtures/credentials.mjs'
const stage=process.argv.includes('--after')?'after':'before',output='artifacts/phase-15'
mkdirSync(output,{recursive:true})
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_omnia-craft','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-t','-A'],{input,encoding:'utf8'})
const plans=[]
for (const table of ['projects','work_items','editorial_items','file_assets','messages','billing_documents','payment_records','automations','notifications']) {
  const query=table==='automations'?"select public.phase13_history('60000000-0000-0000-0000-0000000000a1','runs')":`select * from public.${table} limit 25`
  const raw=sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);explain(analyze,buffers,format json) ${query};rollback;`)
  const plan=JSON.parse(raw.slice(raw.indexOf('[\n'),raw.lastIndexOf(']')+1))[0]
  plans.push({table,query,planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],plan:plan.Plan})
}
writeFileSync(`${output}/sql-${stage}.json`,JSON.stringify({dataset:'deterministic local seed; not production load',plans},null,2))
const browser=await chromium.launch({headless:true})
const routes=[]
try {
  for(const [email,surface,paths] of [['director@omnia.local','app',['/app','/app/projects','/app/messages','/app/analytics','/app/automations']],['client.admin.a@omnia.local','portal',['/portal']]]) {
    const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
    const page=await context.newPage()
    await page.addInitScript(()=>{
      window.__metrics={lcp:0,cls:0,longTasks:[]}
      for(const [type,callback] of [['largest-contentful-paint',entries=>{window.__metrics.lcp=entries.at(-1)?.startTime??0}],['layout-shift',entries=>{for(const entry of entries)if(!entry.hadRecentInput)window.__metrics.cls+=entry.value}],['longtask',entries=>window.__metrics.longTasks.push(...entries.map(e=>e.duration))]]) {
        if(PerformanceObserver.supportedEntryTypes.includes(type))new PerformanceObserver(list=>callback(list.getEntries())).observe({type,buffered:true})
      }
    })
    await page.goto('http://127.0.0.1:53170/login')
    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email)
    await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill(TEST_PASSWORD)
    await page.getByRole('button',{name:'Entrar a OMNIA'}).click()
    await page.waitForURL(`**/${surface}`)
    for(const path of paths) {
      const requests=[],errors=[]
      const listener=request=>requests.push({url:new URL(request.url()).pathname,method:request.method(),type:request.resourceType()})
      const errorListener=error=>errors.push(error.message)
      page.on('request',listener);page.on('pageerror',errorListener)
      const start=performance.now()
      await page.goto(`http://127.0.0.1:53170${path}`)
      await page.getByRole('heading',{level:1}).waitFor()
      await page.waitForTimeout(700)
      const metrics=await page.evaluate(()=>({ ...window.__metrics,resources:performance.getEntriesByType('resource').map(e=>({name:new URL(e.name).pathname,bytes:e.encodedBodySize,transferBytes:e.transferSize})),domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd }))
      routes.push({path,labOnly:true,headingReadyPlus700ms:performance.now()-start,requests,requestCount:requests.length,metrics,errors})
      page.off('request',listener);page.off('pageerror',errorListener)
    }
    await context.close()
  }
} finally {await browser.close()}
writeFileSync(`${output}/routes-${stage}.json`,JSON.stringify(routes,null,2))
if(stage==='after') {
  const violations=routes.flatMap(route=>[
    ...(route.errors.length?[`${route.path}: runtime errors`]:[]),
    ...(route.metrics.lcp>2500?[`${route.path}: lab LCP >2.5s`]:[]),
    ...(route.metrics.cls>0.1?[`${route.path}: CLS >0.1`]:[]),
    ...(route.requestCount>60?[`${route.path}: request count >60`]:[]),
  ])
  const budgets={labLcpMs:2500,cls:0.1,routeRequests:60,scope:'local seed/Chromium production preview, not Cloud p95/RUM',violations,passed:violations.length===0}
  writeFileSync(`${output}/performance-budgets.json`,JSON.stringify(budgets,null,2))
  if(violations.length)throw new Error(violations.join('; '))
}
console.log(JSON.stringify({stage,sql:plans.map(p=>({table:p.table,ms:p.executionMs})),routes:routes.map(r=>({path:r.path,requests:r.requestCount,lcp:r.metrics.lcp,cls:r.metrics.cls,errors:r.errors}))},null,2))
