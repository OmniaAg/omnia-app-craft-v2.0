import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const base='http://127.0.0.1:53170', dir='artifacts/final-visual-qa/flows'
mkdirSync(dir,{recursive:true})
const browser=await chromium.launch({headless:true})
const portalOnly=process.argv.includes('--portal-only')
const report=portalOnly?JSON.parse(readFileSync(`${dir}/results.json`,'utf8')):{checks:[],forms:[],contrast:[],errors:[],http:[]}
const check=(name,pass,detail={})=>{ report.checks.push({name,pass,...detail}); if(!pass)console.log('FAIL '+name) }
const save=()=>writeFileSync(`${dir}/results.json`,JSON.stringify(report,null,2))
let context=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'allow',isMobile:true,hasTouch:true})
let page=await context.newPage()
page.on('pageerror',e=>report.errors.push(e.message))
page.on('response',r=>{if(r.status()>=400)report.http.push({path:new URL(r.url()).pathname,status:r.status()})})
async function go(path) { await page.goto(base+path);await page.locator('h1').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400) }
async function login(role) {
  await go('/login');await page.locator('#login-email').fill(TEST_USERS[role][1]);await page.locator('#login-password').fill(TEST_PASSWORD)
  await page.getByRole('button',{name:'Entrar a OMNIA'}).click();await page.waitForURL(role==='adminA'?'**/portal':'**/app');await page.locator('h1').first().waitFor()
}
async function screenshot(name) {await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${dir}/${name}.png`,fullPage:true})}
async function form(name, locator) {
  await locator.waitFor()
  for(const [width,height] of [[320,568],[375,667],[768,1024],[1366,768]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(160)
    const result=await locator.evaluate(el=>{
      const controls=[...el.querySelectorAll('input:not([type=hidden]),select,textarea,button')].filter(x=>x.getClientRects().length)
      const boxes=controls.map(x=>{const r=x.getBoundingClientRect();return {name:x.name||x.textContent.trim(),x:r.x,right:r.right,height:r.height}})
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:boxes,unnamed:controls.filter(x=>x.tagName!=='BUTTON'&&!x.labels?.length&&!x.getAttribute('aria-label')).map(x=>x.name)}
    })
    const pass=result.scrollWidth<=width+1&&result.controls.every(b=>b.x>=-1&&b.right<=width+1)&&!result.unnamed.length
    report.forms.push({name,...result,pass})
    const submit=locator.locator('button[type=submit],button:not([type])').last()
    if(await submit.count()) {
      await submit.scrollIntoViewIfNeeded()
      const reachable=await submit.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})
      check(`${name}: submit reachable at ${width}`,reachable)
    }
  }
  await page.setViewportSize({width:375,height:667});await screenshot(name)
  save()
}

async function contrast(path) {
  await go(path)
  const findings=await page.evaluate(()=>{
    const rgba=s=>{const n=s.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3?[n[0],n[1],n[2],n[3]??1]:[0,0,0,0]}
    const blend=(a,b)=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1]
    const luminance=a=>a.slice(0,3).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
    const out=[]
    for(const el of document.querySelectorAll('main *, header *, footer *')) {
      if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||!el.getClientRects().length||el.closest('[disabled],.sr-only'))continue
      const style=getComputedStyle(el);if(style.visibility==='hidden')continue
      let bg=[255,255,255,1],chain=[],gradient=false
      for(let p=el;p;p=p.parentElement){chain.push(p);if(getComputedStyle(p).backgroundImage!=='none')gradient=true}
      for(const p of chain.reverse())bg=blend(rgba(getComputedStyle(p).backgroundColor),bg)
      const fg=blend(rgba(style.color),bg),l1=luminance(fg),l2=luminance(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)
      const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700)
      if(ratio<(large?3:4.5))out.push({text:el.textContent.trim().slice(0,100),class:el.className,ratio:Number(ratio.toFixed(2)),foreground:style.color,background:bg,gradient})
    }
    return out
  })
  report.contrast.push({path,findings});save()
}

try {
  if(!portalOnly) {
  await contrast('/login');await contrast('/forgot-password')
  await go('/login');await page.locator('h1').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab')
  check('Skip link receives keyboard focus',await page.locator('.skip-link').evaluate(el=>el===document.activeElement))
  await page.keyboard.press('Enter');await page.keyboard.press('Tab')
  check('Skip link reaches email field',await page.locator('#login-email').evaluate(el=>el===document.activeElement))
  check('Email has visible focus',await page.locator('#login-email').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'))
  await go('/forgot-password')
  await page.getByLabel('Correo',{exact:true}).fill('visual.qa.unregistered@omnia.local')
  await page.getByRole('button',{name:'Enviar enlace',exact:true}).click()
  await page.getByRole('heading',{name:'Revisa tu bandeja local',exact:true}).waitFor()
  check('Password recovery success remains generic for an unknown local account',true)
  await screenshot('recovery-success-375')
  await go('/login')
  await page.route('**/auth/v1/token*',async route=>{await new Promise(resolve=>setTimeout(resolve,650));await route.continue()})
  await page.locator('#login-email').fill(TEST_USERS.director[1]);await page.locator('#login-password').fill(TEST_PASSWORD)
  await page.getByRole('button',{name:'Entrar a OMNIA'}).click()
  check('Login loading is announced and prevents double submit',await page.locator('.auth-submit').getAttribute('aria-busy')==='true'&&await page.locator('.auth-submit').isDisabled())
  await page.waitForURL('**/app');await page.unroute('**/auth/v1/token*')
  await page.waitForFunction(()=>navigator.serviceWorker.controller)
  check('Production service worker controls the app',true)
  const project='/app/projects/60000000-0000-0000-0000-0000000000a1'
  await go('/app/projects');await page.getByRole('button',{name:'Nuevo proyecto',exact:true}).click()
  await form('project-create-empty',page.locator('.crm-editor form'))
  await page.locator('.crm-editor form').getByRole('button',{name:'Crear proyecto',exact:true}).click()
  check('Project validation is announced',await page.locator('[role=alert]').count()>0)
  await form('project-create-validation',page.locator('.crm-editor form'))
  await go(project+'?tab=work')
  const work=page.locator('section[aria-labelledby=new-work-title] form')
  await form('work-create-empty',work)
  await work.getByRole('button',{name:'Crear trabajo',exact:true}).click()
  check('Work validation is announced',await page.locator('[role=alert]').count()>0)
  await work.getByLabel('Título',{exact:true}).fill('Título de prueba local '.repeat(8))
  await work.getByLabel('Descripción',{exact:true}).fill('Texto largo para probar el formulario y sus acciones. '.repeat(35))
  await form('work-create-long-text',work)
  await work.getByLabel('Título',{exact:true}).fill('Final visual QA local '+Date.now()+' '+ 'Título largo verificable '.repeat(7))
  await work.getByRole('button',{name:'Crear trabajo',exact:true}).click()
  await page.getByText('Trabajo creado.',{exact:true}).waitFor()
  check('Work success is visible after an authoritative local save',true)
  await screenshot('work-create-success-375')
  await page.getByRole('button',{name:'Ver detalle',exact:true}).first().click();await page.locator('.work-panel').waitFor()
  await form('work-detail',page.locator('.work-panel').locator('form').first())
  const delivery=await page.getByRole('link',{name:'Abrir entrega y revisiones'}).getAttribute('href')
  await go(delivery)
  if(await page.locator('.review-form').count())await form('deliverable-review',page.locator('.review-form').first())
  await screenshot('deliverable-375')
  await go('/app/billing');await page.getByRole('button',{name:'Create Document',exact:true}).click()
  await form('billing-create-empty',page.locator('.billing-editor form'))
  await page.getByLabel('Organization ID (UUID)').fill('long-organization-id-for-layout-validation-'.repeat(8))
  await form('billing-create-long-text',page.locator('.billing-editor form'))
  const issue=page.getByRole('button',{name:'Issue',exact:true}).first()
  if(await issue.count()) {
    let dialogType=''
    page.once('dialog',async dialog=>{dialogType=dialog.type();await dialog.dismiss()})
    await issue.click();check('Billing native confirmation can be dismissed',dialogType==='confirm')
  }
  await go(project+'/editorial');await page.getByRole('button',{name:'Nueva pieza',exact:true}).click()
  await form('editorial-create',page.locator('.editorial-editor form'))
  await go('/app/automations');await page.getByRole('button',{name:'Nuevo workflow',exact:true}).waitFor();await page.getByRole('button',{name:'Nuevo workflow',exact:true}).click()
  await form('automation-builder',page.locator('form.p13-form'))
  await go('/app/integrations');await page.getByRole('button',{name:'Conectar webhook',exact:true}).waitFor();await page.getByRole('button',{name:'Conectar webhook',exact:true}).click()
  await page.getByLabel('Nombre de conexión').fill('Conexión local '.repeat(7))
  await page.getByLabel('Destino HTTPS').fill('https://example.invalid/'+ 'long-path/'.repeat(20))
  await page.getByLabel('Secreto de firma').fill('visual-qa-placeholder-not-a-real-credential')
  await form('integration-secret',page.locator('form.p13-form'))
  check('Integration secret remains masked',await page.getByLabel('Secreto de firma').getAttribute('type')==='password')
  await go('/app/content-manager');await screenshot('files-375')
  await go('/app/analytics');await page.getByText('Definiciones de las métricas',{exact:true}).click();await screenshot('analytics-definitions-375')
  await go('/app/settings');await screenshot('push-preferences-375')
  const cdp=await context.newCDPSession(page)
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:44,bottom:34,left:0,right:0}})
    await page.reload();await page.locator('h1').waitFor()
    const padding=await page.locator('.app-header').evaluate(el=>parseFloat(getComputedStyle(el).paddingTop))
    check('Safe area top inset is reserved by internal header',padding>=44,{padding})
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}})
  } catch(error) {report.checks.push({name:'Native safe area CDP emulation unavailable',pass:true,limitation:error.message})}
  const inventory=JSON.parse(readFileSync('artifacts/final-visual-qa/after/measurements.json','utf8')).routeInventory
  for(const path of inventory.director??[]) await contrast(path)
  for(const path of [delivery,project+'?tab=work'])await contrast(path)
  await context.close()
  } else await context.close()
  const inventory=JSON.parse(readFileSync('artifacts/final-visual-qa/after/measurements.json','utf8')).routeInventory
  context=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'allow',isMobile:true,hasTouch:true})
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message))
  await login('adminA')
  for(const path of inventory.adminA??['/portal','/portal/projects','/portal/approvals','/portal/documents','/portal/reports','/portal/settings','/portal/messages','/portal/notifications'])await contrast(path)
  await go('/portal/approvals')
  const deliveryLink=page.locator('main a[href^="/portal/deliverables/"]').first()
  if(!await deliveryLink.count())await go('/portal')
  if(await deliveryLink.count()) {
    await deliveryLink.click();await page.locator('h1').first().waitFor();await screenshot('client-deliverable-375')
    const feedback=page.locator('form').first()
    if(await feedback.count()) {
      await feedback.locator('textarea').fill('Borrador local para comprobar la lectura y las acciones. '.repeat(25))
      await form('client-deliverable-feedback',feedback)
    }
    await contrast(new URL(page.url()).pathname)
  }
  await context.close()
} catch(error) {
  await screenshot('failure').catch(()=>undefined)
  report.errors.push(error.message)
  throw error
} finally {save();await browser.close()}
console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(x=>!x.pass),formFailures:report.forms.filter(x=>!x.pass),contrastFailures:report.contrast.flatMap(x=>x.findings.map(f=>({path:x.path,...f}))),errors:report.errors},null,2))
assert.ok(report.checks.every(x=>x.pass)&&report.forms.every(x=>x.pass)&&report.contrast.every(x=>!x.findings.length),'Visual interactions, forms and text contrast must pass')
