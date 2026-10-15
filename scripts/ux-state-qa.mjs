import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { TEST_PASSWORD,TEST_USERS } from './test-fixtures/credentials.mjs'

const base=process.env.QA_BASE_URL??'http://127.0.0.1:53172'
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname))
const dir='artifacts/ux-refactor/state-qa';mkdirSync(dir,{recursive:true})
const report={completed:false,checks:[],events:[],errors:[]}
const check=(name,pass)=>{report.checks.push({name,pass:Boolean(pass)});assert.ok(pass,name)}
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
context.setDefaultTimeout(15000)
const page=await context.newPage()
page.on('pageerror',error=>report.errors.push(error.message))
page.on('dialog',dialog=>dialog.accept())
const workPath='/app/projects/60000000-0000-0000-0000-0000000000a1?tab=work'
async function login(role) {
  await page.goto(base+'/login');await page.locator('#login-email').fill(TEST_USERS[role][1]);await page.locator('#login-password').fill(TEST_PASSWORD)
  await page.getByRole('button',{name:'Entrar a OMNIA'}).click();await page.waitForURL(`**/${role==='adminA'?'portal':'app'}`)
}
async function work() {await page.goto(base+workPath);await page.locator('input[name=title]').first().waitFor();return page.locator('input[name=title]').first()}
async function saved(target=page) {await target.getByText('Borrador guardado',{exact:true}).waitFor({timeout:15000})}
try {
  await login('director')
  let title=await work()
  const marker=`UX recovery ${Date.now()}`
  await title.fill(marker);await saved()
  const cdp=await context.newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false})
  await page.evaluate(()=>{window.uxFocusEvents=[];for(const type of ['focus','blur'])addEventListener(type,()=>window.uxFocusEvents.push({type,visibility:document.visibilityState}));document.addEventListener('visibilitychange',()=>window.uxFocusEvents.push({type:'visibilitychange',visibility:document.visibilityState}))})
  const tab=await context.newPage();tab.on('dialog',dialog=>dialog.accept());await tab.goto('about:blank');await tab.bringToFront();await page.waitForTimeout(120);await page.bringToFront();await page.waitForTimeout(120)
  check('Switch browser tab and return preserves Work input',await title.inputValue()===marker)
  const otherWindow=await browser.newContext();const otherPage=await otherWindow.newPage();await otherPage.goto('about:blank');await otherPage.bringToFront();await page.waitForTimeout(120);await page.bringToFront();await page.waitForTimeout(120);await otherWindow.close()
  check('Switch Chrome window and return preserves Work input',await title.inputValue()===marker)
  report.events=await page.evaluate(()=>window.uxFocusEvents)
  check('Chrome emitted real blur and focus events',report.events.some(x=>x.type==='blur')&&report.events.some(x=>x.type==='focus'))
  report.visibilityLimitation='Chrome automation keeps document.visibilityState visible; tab/window switching is verified through real blur/focus, separately from explicit TOKEN_REFRESHED regression.'
  await page.evaluate(async()=>{const {getSupabaseClient}=await import('/src/shared/api/supabase/client.ts');await getSupabaseClient().auth.refreshSession()})
  await page.waitForTimeout(700)
  check('Same-actor TOKEN_REFRESHED does not remount Work form',await title.inputValue()===marker)
  await page.reload();title=page.locator('input[name=title]').first();await title.waitFor();check('Refresh restores a server-confirmed draft',await title.inputValue()===marker)
  await page.getByRole('link',{name:'Inicio',exact:true}).click();await page.waitForURL('**/app')
  await page.goBack();await title.waitFor();check('Navigation away and browser back restores Work draft',await title.inputValue()===marker)
  await context.setOffline(true);await title.fill(marker+' offline');await page.getByText(/No pudimos guardar el borrador/).waitFor({timeout:15000})
  check('Network failure preserves current Work input',await title.inputValue()===marker+' offline')
  await page.getByRole('link',{name:'Inicio',exact:true}).click();await page.waitForTimeout(500)
  check('Navigation is held when safe autosave fails',page.url().includes('?tab=work'))
  await context.setOffline(false);await page.getByRole('button',{name:'Reintentar borrador'}).click();await saved()
  check('Retry confirms the same input on the server',await title.inputValue()===marker+' offline')
  await tab.goto(base+workPath);const second=tab.locator('input[name=title]').first();await second.waitFor()
  check('Second tab restores the current revision',await second.inputValue()===marker+' offline')
  await title.fill(marker+' first tab');await saved()
  await second.fill(marker+' stale tab');await tab.getByText(/Otra pestaña cambió este borrador/).waitFor()
  check('Stale tab receives a conflict and keeps its input',await second.inputValue()===marker+' stale tab')
  await page.reload();await title.waitFor();check('Stale tab cannot overwrite the newer server draft',await title.inputValue()===marker+' first tab')
  await tab.getByRole('button',{name:'Cargar borrador del servidor',exact:true}).click();await tab.waitForFunction(value=>document.querySelector('input[name=title]')?.value===value,marker+' first tab')
  check('Explicit conflict reload replaces local content only after confirmation',await second.inputValue()===marker+' first tab')
  await tab.close()
  await title.fill(marker+' logout');await saved()
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.waitForURL('**/login')
  await login('pm');title=await work()
  check('User B cannot see user A recovery content',!(await title.inputValue()).includes(marker))
  const storage=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>!key.startsWith('sb-')))
  check('No private draft content in localStorage',!JSON.stringify(storage).includes(marker))
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.waitForURL('**/login')
  await login('director');title=await work();check('Logout and login restore only the same owner draft',await title.inputValue()===marker+' logout')
  await page.evaluate(async scope=>{const {getSupabaseClient}=await import('/src/shared/api/supabase/client.ts');const api=getSupabaseClient();const actor=(await api.auth.getUser()).data.user;const row=await api.from('user_drafts').select('revision').eq('owner_id',actor.id).eq('kind','work').eq('scope_id',scope).eq('draft_key','create').single();if(row.error)throw Error('Draft fixture unavailable');const saved=await api.rpc('save_user_draft',{p_owner:actor.id,p_kind:'work',p_scope:scope,p_key:'create',p_revision:row.data.revision,p_body:{title:42}});if(saved.error)throw Error('Incompatible draft fixture rejected')},'60000000-0000-0000-0000-0000000000a1')
  await page.reload();await page.getByText('El borrador tiene un formato incompatible. Se conserva en tu cuenta hasta que decidas descartarlo.',{exact:true}).waitFor();check('Incompatible recovery data shows an explicit safe state',await page.getByRole('button',{name:'Descartar borrador incompatible',exact:true}).isVisible());await page.screenshot({path:`${dir}/incompatible-draft.png`,fullPage:true});await page.getByRole('button',{name:'Descartar borrador incompatible',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[name=title]')?.value==='');check('Explicit incompatible draft discard restores usable blank form',await title.inputValue()==='')
  await page.screenshot({path:`${dir}/recovered-work.png`,fullPage:true})
  for(const width of [320,375,768,1024,1366,1440,1920]) {
    await page.setViewportSize({width,height:900})
    const toggle=page.getByRole('button',{name:'Menú',exact:true})
    if(await toggle.isVisible())await toggle.click()
    const workMenu=page.getByRole('navigation',{name:'Navegación interna'}).getByRole('button',{name:'Trabajo',exact:true})
    await workMenu.click()
    check(`Grouped navigation exposes project destination at ${width}`,await page.getByRole('navigation',{name:'Navegación interna'}).getByRole('link',{name:'Proyectos',exact:true}).isVisible())
    await page.keyboard.press('Escape')
    check(`Escape restores navigation trigger focus at ${width}`,await workMenu.evaluate(el=>document.activeElement===el))
    await page.keyboard.press('Escape')
  }
  check('No runtime errors during persistence and navigation flows',report.errors.length===0)
  report.completed=true
}catch(error){await page.screenshot({path:`${dir}/failure.png`,fullPage:true}).catch(()=>undefined);throw error}
finally{writeFileSync(`${dir}/results.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(check=>!check.pass).length}))
