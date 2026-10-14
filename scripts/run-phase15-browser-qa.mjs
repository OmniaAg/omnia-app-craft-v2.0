import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'
const {status}=await waitForPostgrest(),project='60000000-0000-0000-0000-0000000000a1',base='http://127.0.0.1:53170'
const api=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false}})
assert.equal((await api.auth.signInWithPassword({email:TEST_USERS.director[1],password:TEST_PASSWORD})).error,null)
assert.equal((await api.rpc('add_project_member',{project_id:project,user_id:TEST_USERS.reviewerA[0],member_type:'client',responsibility:'client_member',idempotency_key:randomUUID()})).error,null)
assert.equal((await api.rpc('configure_review_requirements',{project_id:project,deliverable_id:null,reviewer_ids:[TEST_USERS.director[0]],idempotency_key:randomUUID()})).error,null)
await api.auth.signOut()
let source=readFileSync('scripts/qa-phase14-playwright.js','utf8').replace('async page =>','export default async page =>').replaceAll('artifacts/phase-14/','artifacts/phase-15/')
source=source.replace("['Archivos','/app/content-manager','files']","['Mis revisiones','/app/reviews','reviews'],['Editorial','/app/editorial/calendar','editorial'],['Archivos','/app/content-manager','files']")
writeFileSync('artifacts/phase-15/responsive-runner.mjs',source)
const responsive=(await import(pathToFileURL(resolve('artifacts/phase-15/responsive-runner.mjs')).href)).default
const browser=await chromium.launch({headless:true}),checks=[],errors=[],consoleErrors=[],httpErrors=[]
let activePage
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'allow'})
 const page=await context.newPage()
 activePage=page
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())})
 page.on('response',r=>{if(r.status()>=400)httpErrors.push({path:new URL(r.url()).pathname,status:r.status()})})
 const report=process.argv.includes('--workflows-only')?JSON.parse(readFileSync('artifacts/phase-15/browser-responsive.json','utf8')):await responsive(page)
 writeFileSync('artifacts/phase-15/browser-responsive.json',JSON.stringify(report,null,2))
 assert.equal(report.findings.length,0);assert.equal(report.runtimeErrors.length,0)
 await context.close()
 const workflows=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'allow'})
 const view=await workflows.newPage();view.on('pageerror',e=>errors.push(e.message))
 view.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
 view.on('response',response=>{if(response.status()>=400)httpErrors.push({path:new URL(response.url()).pathname,status:response.status()})})
 activePage=view
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log(`PASS ${name}`)}
 async function login(name,surface) {
  await view.goto(base+'/login')
  await view.getByRole('textbox',{name:'Correo',exact:true}).fill(TEST_USERS[name][1]);await view.locator('#login-password').fill(TEST_PASSWORD)
  await view.getByRole('button',{name:'Entrar a OMNIA'}).click();await view.waitForURL(`**/${surface}`)
 }
 async function logout(){await view.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await view.waitForURL('**/login')}
 await login('director','app')
 const response=await view.request.get(base+'/app')
 check('preview enforces CSP, frame protection and MIME header',!!response.headers()['content-security-policy']&&response.headers()['x-frame-options']==='DENY'&&response.headers()['x-content-type-options']==='nosniff')
 check('HTTP preview does not pretend to enforce HSTS',!response.headers()['strict-transport-security'])
 await view.goto(`${base}/app/projects/${project}?tab=work`)
 const title=`Phase15 <img src=x onerror=alert(1)> ${Date.now()}`
 const form=view.locator('section[aria-labelledby="new-work-title"] form')
 await form.getByLabel('Título',{exact:true}).fill(title);await form.getByLabel('Descripción',{exact:true}).fill('QA local: texto hostil se presenta como texto.')
 await form.locator(`input[type="checkbox"][value="${TEST_USERS.pm[0]}"]`).check()
 assert.equal(await form.getByLabel('Título',{exact:true}).inputValue(),title,'Work title must survive assignee selection')
 const creationResponse=view.waitForResponse(response=>response.url().endsWith('/rpc/create_work_item'),{timeout:15000})
 await form.getByRole('button',{name:'Crear trabajo',exact:true}).click()
 const createdResponse=await creationResponse
 assert.equal(createdResponse.status(),200,'Work command must return successful authoritative response')
 console.log('Work RPC returned an authoritative ID:',await createdResponse.json())
 const row=view.getByRole('row').filter({hasText:title});await row.waitFor()
 check('Director creates real Work; hostile title remains text',await row.count()===1&&await view.locator('main img[src="x"]').count()===0)
 await row.getByRole('button',{name:'Ver detalle'}).click()
 const actions=view.locator('section[aria-labelledby="work-transition-title"] button')
 const transition=await actions.first().textContent();await actions.first().click();await view.getByText('Estado actualizado.',{exact:true}).waitFor()
 check(`Work state transition ${transition} persisted`,true)
 const deliverablePath=await view.getByRole('link',{name:'Abrir entrega y revisiones'}).getAttribute('href')
 await logout();await login('pm','app');await view.goto(base+deliverablePath)
 await view.locator('#deliverable-title').fill('Phase15 review fixture')
 await view.getByRole('button',{name:'Crear entrega',exact:true}).click();await view.getByText('Entrega creada.',{exact:true}).waitFor()
 await view.locator('#version-notes').fill('Versión de QA local sin archivo privado.')
 await view.getByRole('button',{name:'Enviar a revisión',exact:true}).click();await view.getByText('Versión enviada a revisión.',{exact:true}).waitFor()
 check('assigned PM creates and submits real deliverable',true)
 await logout();await login('director','app');await view.goto(base+deliverablePath)
 await view.getByRole('button',{name:'Aprobar',exact:true}).click();await view.getByText('Decisión registrada.',{exact:true}).waitFor()
 check('assigned Director approves another actor’s submission',true)
 await view.getByRole('button',{name:'Publicar entrega',exact:true}).click();await view.getByText('Publicación registrada.',{exact:true}).waitFor()
 check('Director publishes approved version',true)
 await logout();await login('reviewerA','portal');await view.goto(base+'/portal/approvals')
 await view.getByRole('link').filter({hasText:'Phase15 review fixture'}).first().click()
 await view.getByRole('button',{name:'Aprobar versión',exact:true}).click();await view.getByText('Tu decisión quedó registrada.',{exact:true}).waitFor()
 check('assigned Client approves the published version',true)
 await logout();await login('contributor','app');await view.goto(base+'/app/billing')
 await view.getByRole('heading',{name:'Billing Tracking'}).waitFor()
 check('Contributor cannot create financial documents',await view.getByRole('button',{name:'Create Document',exact:true}).count()===0)
 await view.goto(`${base}/app/projects/${project}/assistant`)
 await view.getByRole('heading',{name:'Asistente del proyecto'}).waitFor()
 check('Contributor AI surface preserves assigned scope',await view.getByRole('button',{name:'Habilitar asistencia de IA',exact:true}).count()===0)
 await logout();await login('pmBasic','app');await view.goto(base+'/app/automations')
 await view.getByText('No tienes un proyecto autorizado para automatizaciones.',{exact:true}).waitFor()
 check('PM without capability cannot manage automation',await view.getByRole('button',{name:'Nuevo workflow',exact:true}).count()===0)
 await workflows.close()
 writeFileSync('artifacts/phase-15/browser-workflows.json',JSON.stringify({passed:checks.length,checks,errors,consoleErrors,httpErrors,viewports:report.widths,lab:true,nativePush:false},null,2))
 assert.equal(errors.length,0)
 assert.equal(consoleErrors.length,0)
 assert.equal(httpErrors.length,0)
 console.log(`PASS: ${report.passed} responsive/PWA/Push checks plus ${checks.length} role workflows.`)
} catch(error) {
 if(activePage&&!activePage.isClosed()) {
  await activePage.screenshot({path:'artifacts/phase-15/browser-failure.png',fullPage:true}).catch(()=>undefined)
  const text=await activePage.locator('body').innerText().catch(()=> '')
  writeFileSync('artifacts/phase-15/browser-failure.txt',text)
  console.error(text.slice(-1800))
 }
 throw error
} finally {await browser.close()}
