import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {TEST_PASSWORD,TEST_USERS} from './test-fixtures/credentials.mjs'

const base='http://127.0.0.1:53170',dir='artifacts/ux-refactor/accessibility'
mkdirSync(dir,{recursive:true})
const report=process.env.QA_ZOOM_ONLY||process.env.QA_FILE_ERROR_ONLY?JSON.parse(readFileSync(`${dir}/results.json`,'utf8')):{checks:[],contrast:[],targets:[],errors:[],zoom:[],screens:[]}
if(process.env.QA_ZOOM_ONLY){report.checks=report.checks.filter(x=>!x.name.includes('real Chrome 200%'));report.zoom=[];for(const key of ['contrast','targets','screens'])report[key]=report[key].filter(x=>!x.name.startsWith('zoom-'))}
const save=()=>writeFileSync(`${dir}/results.json`,JSON.stringify(report,null,2))
const check=(name,pass,detail={})=>{report.checks.push({name,pass,...detail});save();if(!pass)console.log('FAIL '+name)}
const browser=await chromium.launch({channel:'chrome',headless:true})
let context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'})
let page=await context.newPage()
page.on('pageerror',e=>report.errors.push(e.message))
async function go(path){await page.goto(base+path);await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500)}
async function login(role){await go('/login');await page.locator('#login-email').fill(TEST_USERS[role][1]);await page.locator('#login-password').fill(TEST_PASSWORD);await page.getByRole('button',{name:'Entrar a OMNIA'}).click();await page.waitForURL(`**/${role==='adminA'?'portal':'app'}`);await page.waitForTimeout(500)}
async function inspect(name){
 const data=await page.evaluate(()=>{
  const rgba=s=>{const n=s.match(/[\d.]+/g)?.map(Number);return n?.length>=3?[n[0],n[1],n[2],n[3]??1]:[0,0,0,0]}
  const blend=(a,b)=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1]
  const luminance=a=>a.slice(0,3).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
  const contrast=[],targets=[]
  for(const el of document.querySelectorAll('main *,header *')){
   if(!el.getClientRects().length||el.closest('[disabled],.sr-only')||getComputedStyle(el).visibility==='hidden')continue
   if([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){
    const style=getComputedStyle(el);let bg=[255,255,255,1],chain=[],gradient=false
    for(let p=el;p;p=p.parentElement){chain.push(p);if(getComputedStyle(p).backgroundImage!=='none')gradient=true}
    for(const p of chain.reverse())bg=blend(rgba(getComputedStyle(p).backgroundColor),bg)
    const fg=blend(rgba(style.color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05)
    const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700)
    if(ratio<(large?3:4.5))contrast.push({text:el.textContent.trim().slice(0,95),ratio:Number(ratio.toFixed(2)),gradient,foreground:style.color,background:bg})
   }
   if(el.matches('button,summary,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea')){const r=el.getBoundingClientRect();if(r.width<24||r.height<24)targets.push({tag:el.tagName,label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent||el.textContent,width:r.width,height:r.height})}
  }
  return{contrast,targets,width:innerWidth,scroll:document.documentElement.scrollWidth}
 })
 report.contrast.push({name,path:new URL(page.url()).pathname,findings:data.contrast});report.targets.push({name,findings:data.targets});report.screens.push({name,path:new URL(page.url()).pathname,width:data.width,scroll:data.scroll})
 await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});save()
}
try{
 if(process.env.QA_FILE_ERROR_ONLY){
  await login('director');const fixture=JSON.parse(readFileSync('artifacts/ux-refactor/functional/results.json','utf8')).fixtures;await go('/app/content-manager?project='+fixture.project+'&status=archived');const row=page.locator('.file-row').filter({hasText:'lifecycle.png'}).first();await row.waitFor();page.on('dialog',d=>d.accept());await row.getByRole('button',{name:'Eliminar permanentemente',exact:true}).click();await row.getByText(/^No se puede eliminar:/).waitFor();await inspect('file-protected-error');check('Linked file error is understandable and remains readable',await row.getByText(/^No se puede eliminar:/).isVisible())
 }else{
 if(!process.env.QA_ZOOM_ONLY){
 await go('/login');await inspect('login-mobile');await page.locator('h1').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');check('Skip link is first keyboard destination',await page.locator('.skip-link').evaluate(el=>el===document.activeElement));await page.keyboard.press('Enter');await page.keyboard.press('Tab');check('Skip link reaches form',await page.locator('#login-email').evaluate(el=>el===document.activeElement));check('Keyboard focus is visible',await page.locator('#login-email').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'))
 await page.locator('#login-password').fill(TEST_PASSWORD);await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();check('Password visibility toggle works',await page.locator('#login-password').getAttribute('type')==='text');await page.getByRole('button',{name:'Ocultar contraseña',exact:true}).click()
 await go('/forgot-password');await page.getByLabel('Correo',{exact:true}).fill('ux.unregistered@omnia.local');await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();await page.getByRole('heading',{name:'Revisa tu bandeja local',exact:true}).waitFor();await inspect('recovery-success');check('Recovery gives generic success for unknown local account',true)
 await login('contributorB');for(const path of ['/reset-password','/accept-invite?invitation=00000000-0000-0000-0000-000000000000']){await go(path);const fields=page.locator('input[type=password]');await fields.first().fill('short');await fields.last().fill('different');await page.getByRole('button',{name:/Guardar|Activar|Aceptar/}).last().click();await inspect(path.startsWith('/reset')?'reset-validation':'invite-validation');check(`${path}: invalid password is announced`,await page.getByRole('alert').count()>0)}
 await context.close();context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await login('director')
 const prior=JSON.parse(readFileSync('artifacts/final-visual-qa/after/measurements.json','utf8')).routeInventory
 const paths=[...new Set(prior.director)].filter(path=>!path.includes('?tab=')&&!path.includes('/push/'))
 for(const [i,path]of paths.entries()){await go(path);await inspect('internal-'+i)}
 await go('/app/automations?project=60000000-0000-0000-0000-0000000000a1');await page.getByRole('button',{name:'Nuevo workflow',exact:true}).click();await inspect('builder-mobile');await page.getByRole('button',{name:'Cerrar editor'}).click()
 await go('/app');check('Reduced motion disables page entry animation',await page.locator('.dashboard-page').evaluate(el=>getComputedStyle(el).animationName==='none'))
 await context.close();context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});page=await context.newPage();await login('adminA');for(const [i,path]of [...new Set(prior.adminA)].entries()){await go(path);await inspect('portal-'+i)}
 await context.close()
 }
 const profile=mkdtempSync(join('supabase/.temp/','ux-zoom-'));mkdirSync(join(profile,'Default'),{recursive:true});writeFileSync(join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}))
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:null,serviceWorkers:'block',args:['--window-size=1440,900']});page=context.pages()[0];await login('director')
 for(const path of ['/app','/app/projects','/app/automations?project=60000000-0000-0000-0000-0000000000a1']){await go(path);const result=await page.evaluate(()=>({dpr:devicePixelRatio,width:innerWidth,outerWidth,scroll:document.documentElement.scrollWidth,visualScale:visualViewport.scale}));report.zoom.push({path,...result});check(`${path}: real Chrome 200% zoom reflows`,Math.abs(result.dpr-2)<.02&&result.width<800&&result.scroll<=result.width+1,result);await inspect('zoom-'+report.zoom.length)}await context.close()
 context=await chromium.launchPersistentContext(mkdtempSync(join('supabase/.temp/','ux-standalone-')),{channel:'chrome',headless:true,viewport:null,serviceWorkers:'allow',args:['--app='+base,'--window-size=430,932']});page=context.pages()[0];await go('/login');const standalone=await page.evaluate(()=>matchMedia('(display-mode:standalone)').matches);check('Chrome application window uses standalone display mode',standalone);await inspect('standalone-login');await context.close()
 }
}finally{save();await context.close().catch(()=>{});await browser.close()}
console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(x=>!x.pass).length,contrast:report.contrast.flatMap(x=>x.findings).length,smallTargets:report.targets.flatMap(x=>x.findings).length,errors:report.errors.length}))
assert.ok(report.checks.every(x=>x.pass)&&!report.errors.length&&report.contrast.every(x=>!x.findings.length)&&report.targets.every(x=>!x.findings.length)&&report.screens.every(x=>x.scroll<=x.width+1),'Accessibility interactions contrast targets and layout must pass')
