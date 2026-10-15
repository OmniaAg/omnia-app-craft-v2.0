import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const stage = process.argv.includes('--before') ? 'before' : 'after'
const workOnly = process.argv.includes('--work-detail-only')
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:53170'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local QA only')
const dir = `artifacts/final-visual-qa/${stage}`
mkdirSync(dir, { recursive: true })
const sizes = [[320,568],[360,740],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080],[844,390]]
const report = process.argv.includes('--roles-only') || workOnly ? JSON.parse(readFileSync(`${dir}/measurements.json`,'utf8')) : { stage, base, rows: [], interactions: [], errors: [], console: [], http: [], routeInventory: {}, limitations: ['Chromium emulation; no physical mobile keyboard or OS installation.'] }
const browser = await chromium.launch({ headless: true })
const save = () => writeFileSync(`${dir}/measurements.json`, JSON.stringify(report, null, 2))

async function settle(page) {
  await page.locator('h1').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.evaluate(() => scrollTo(0,0))
}

async function measure(page, role, route, state = 'default') {
  await page.waitForTimeout(route==='/app'?400:140)
  const data = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right } }
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
    const name = el => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0,110)
    const scrollParent = el => {
      for (let p=el.parentElement; p && p!==document.body; p=p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowX) && p.scrollWidth>p.clientWidth+1) return p.className
      }
      return null
    }
    const elements = [...document.querySelectorAll('main *, header *, footer *')].filter(visible)
    const escaped = elements.filter(el => {
      const r=rect(el)
      return r.width>0 && (r.right>innerWidth+2 || r.x< -2) && !el.closest('.skip-link,.sr-only') && !scrollParent(el)
    }).slice(0,25).map(el=>({name:name(el),class:el.className,box:rect(el)}))
    const controls = [...document.querySelectorAll('button,input,select,textarea,a,summary')].filter(visible)
    const smallTargets = controls.filter(el=> { const r=rect(el); return (r.height<43 || r.width<43) && !el.closest('.skip-link') }).map(el=>({name:name(el),box:rect(el)}))
    const clipped = controls.filter(el => {
      if (el.closest('.skip-link')) return false
      const r=rect(el)
      for(let p=el.parentElement;p && p!==document.body;p=p.parentElement) {
        const s=getComputedStyle(p), b=rect(p)
        if (/hidden|clip/.test(s.overflowY) && (r.y<b.y-2 || r.bottom>b.bottom+2)) return true
      }
      return false
    }).map(el=>({name:name(el),box:rect(el)}))
    const box = selector => document.querySelector(selector) ? rect(document.querySelector(selector)) : null
    return { width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight,
      heading:box('h1'),form:box('.auth-form'),cta:box('.auth-submit'),logo:box('.auth-brand__logo'), escaped,clipped,smallTargets,
      intentionalScroll:[...document.querySelectorAll('main *')].filter(el=>visible(el)&&/auto|scroll/.test(getComputedStyle(el).overflowX)&&el.scrollWidth>el.clientWidth+1).map(el=>({class:el.className,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth})),
      alerts:[...document.querySelectorAll('[role=alert]')].filter(visible).map(el=>el.textContent.trim()),
      title:document.querySelector('h1')?.textContent }
  })
  const loginFits = route !== '/login' || state !== 'default' || data.height<568 || (data.cta?.bottom <= data.height+1 && data.logo?.y>=0 && data.scrollHeight<=data.height+1)
  const pass = data.scrollWidth<=data.clientWidth+1 && !data.escaped.length && !data.clipped.length && loginFits
  const row = {role, route, state, ...data, result:pass?'PASS':'FAIL'}
  report.rows.push(row)
  save()
  return row
}

async function shot(page, name) { await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${dir}/${name}.png`,fullPage:true}) }
function watch(page, role) {
  page.on('pageerror',e=>report.errors.push({role,route:new URL(page.url()).pathname,message:e.message}))
  page.on('console',m=> {if(m.type()==='error')report.console.push({role,route:new URL(page.url()).pathname,message:m.text()})})
  page.on('response',r=> {if(r.status()>=400)report.http.push({role,path:new URL(r.url()).pathname,status:r.status()})})
}

async function login(page, role) {
  await page.goto(base+'/login')
  await page.locator('#login-email').fill(TEST_USERS[role][1])
  await page.locator('#login-password').fill(TEST_PASSWORD)
  await page.getByRole('button',{name:'Entrar a OMNIA'}).click()
  await page.waitForURL(`**/${role==='adminA'?'portal':'app'}`)
  await settle(page)
}

const internal = ['/app','/app/my-space','/app/reviews','/app/content-manager','/app/projects','/app/messages','/app/notifications','/app/settings','/app/billing','/app/editorial/calendar','/app/analytics','/app/automations','/app/integrations','/app/crm/accounts','/app/crm/contacts','/app/crm/opportunities']
const portal = ['/portal','/portal/projects','/portal/approvals','/portal/messages','/portal/notifications','/portal/documents','/portal/reports','/portal/settings']

try {
  if (!process.argv.includes('--roles-only') && !workOnly) {
  const authContext = await browser.newContext({serviceWorkers:'block'})
  const auth = await authContext.newPage(); watch(auth,'anonymous')
  for(const route of ['/login','/forgot-password','/reset-password','/accept-invite','/forbidden','/missing-visual-qa']) {
    await auth.goto(base+route); await settle(auth)
    for(const [width,height] of sizes) {
      await auth.setViewportSize({width,height}); await auth.evaluate(()=>scrollTo(0,0))
      await measure(auth,'anonymous',route)
      if(route==='/login' && [375,390,1366,1440].includes(width)) await shot(auth,`login-${width}x${height}`)
    }
  }
  await auth.setViewportSize({width:375,height:667}); await auth.goto(base+'/login'); await settle(auth)
  await auth.getByRole('button',{name:'Entrar a OMNIA'}).click()
  await auth.locator('[role=alert]').first().waitFor()
  await measure(auth,'anonymous','/login','validation'); await shot(auth,'login-validation-375')
  await auth.locator('#login-email').fill('long.email.for.visual.qa@omnia.local')
  await auth.locator('#login-password').fill('invalid-local-password')
  await auth.getByRole('button',{name:'Mostrar contraseña'}).click()
  report.interactions.push({name:'Password visibility toggle',pass:await auth.locator('#login-password').getAttribute('type')==='text'})
  await auth.getByRole('button',{name:'Entrar a OMNIA'}).click(); await auth.locator('.auth-message--error').waitFor()
  await measure(auth,'anonymous','/login','auth-error'); await shot(auth,'login-auth-error-375')
  await authContext.close()
  }

  for(const role of workOnly?['director']:['director','pm','contributor','adminA']) {
    const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
    const page=await context.newPage();watch(page,role);await login(page,role)
    const surface=role==='adminA'?'/portal':'/app'
    const routes=workOnly?[report.routeInventory.pm.find(path=>path.includes('&workItem='))]:[...(surface==='/app'?internal:portal)]
    assert.ok(routes.every(Boolean),'A real work detail fixture must be available')
    if(!workOnly) {
    const dynamic=new Map()
    for(const route of routes) {
      await page.goto(base+route);await settle(page)
      if(role==='contributor'&&route==='/app/billing')report.interactions.push({role,name:'Billing creation hidden without capability',pass:await page.getByRole('button',{name:'Create Document',exact:true}).count()===0})
      if(role==='contributor'&&route==='/app/automations')report.interactions.push({role,name:'Automation creation hidden without capability',pass:await page.getByRole('button',{name:'Nuevo workflow',exact:true}).count()===0})
      if(role==='adminA'&&route==='/portal')report.interactions.push({role,name:'Portal exposes no internal routes or null project links',pass:await page.locator('a[href^="/app"],a[href="/portal/projects/null"]').count()===0})
      const links=await page.locator('main a[href]').evaluateAll(els=>els.map(el=>el.getAttribute('href')))
      for(const path of links) {
        if(!path?.startsWith(surface+'/')) continue
        const clean=path.split('?')[0]
        const template=clean.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,':id')
        if(!routes.includes(clean) && (!dynamic.has(template) || clean.endsWith('0000000000a1'))) dynamic.set(template,clean)
      }
    }
    routes.push(...dynamic.values())
    const organization=routes.find(path=>/^\/app\/crm\/accounts\/[0-9a-f-]+$/.test(path))
    if(organization) routes.push(...['brands','contacts','opportunities','activity'].map(tab=>organization+'?tab='+tab))
    const project=routes.find(path=>new RegExp(`^${surface}/projects/[0-9a-f-]+$`).test(path))
    if(project && surface==='/app') {
      routes.push(project+'?tab=work',project+'/reviews',project+'/editorial',project+'/assistant')
      await page.goto(base+project+'?tab=work');await settle(page)
      const detail=page.getByRole('button',{name:'Ver detalle',exact:true}).first()
      await detail.waitFor({state:'visible',timeout:5000}).catch(()=>undefined)
      if(await detail.count()) {
        await detail.click();await page.locator('.work-panel').waitFor()
        routes.push(new URL(page.url()).pathname+new URL(page.url()).search)
        const delivery=await page.getByRole('link',{name:'Abrir entrega y revisiones'}).getAttribute('href')
        if(delivery) routes.push(delivery)
      }
    }
    report.routeInventory[role]=routes
    } else report.routeInventory.director=[...new Set([...report.routeInventory.director,...routes])]
    const roleSizes=role==='director'||role==='adminA'?sizes:[[375,667],[768,1024],[1366,768]]
    for(const route of routes) {
      await page.goto(base+route);await settle(page)
      for(const [width,height] of roleSizes) {
        await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0))
        await measure(page,role,route)
        if([375,1366].includes(width) && ['/app/billing','/app/messages','/portal/messages','/app/automations','/portal','/app'].includes(route)) await shot(page,`${role}-${route.replaceAll('/','-')}-${width}`)
      }
    }
    if(workOnly) {await shot(page,'director-work-detail-844');await context.close();continue}
    await page.setViewportSize({width:375,height:667});await page.goto(base+surface+'/messages');await settle(page)
    const channel=page.locator('.messaging-channel').first()
    if(await channel.count()) {
      await channel.click(); await page.locator('.messaging-composer').waitFor()
      await page.locator('#message-body').fill('QA visual local: borrador sin enviar. '.repeat(8))
      await measure(page,role,new URL(page.url()).pathname,'conversation-draft');await shot(page,`${role}-conversation-375`)
      await page.setViewportSize({width:375,height:360}); await page.locator('#message-body').focus();await page.locator('#message-body').scrollIntoViewIfNeeded()
      await measure(page,role,new URL(page.url()).pathname,'keyboard-height-simulation')
      await page.getByRole('button',{name:'Enviar',exact:true}).scrollIntoViewIfNeeded()
      report.interactions.push({role,name:'Composer reachable at reduced viewport height',pass:await page.getByRole('button',{name:'Enviar',exact:true}).isVisible()})
      await page.setViewportSize({width:375,height:667});await page.getByRole('button',{name:'Cambiar canal'}).click()
      report.interactions.push({role,name:'Return to channel list',pass:await channel.isVisible()})
    }
    await page.goto(base+surface+'/settings');await settle(page)
    await page.getByRole('button',{name:surface==='/app'?'Menú':'Menú del portal',exact:true}).focus()
    await page.keyboard.press('Enter')
    report.interactions.push({role,name:'Keyboard opens navigation',pass:await page.locator('nav[data-open=true]').count()===1})
    await page.keyboard.press('Escape')
    report.interactions.push({role,name:'Escape closes navigation',pass:await page.locator('nav[data-open=false]').count()===1})
    await page.emulateMedia({reducedMotion:'reduce'})
    await measure(page,role,surface+'/settings','reduced-motion')
    await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}))
    await page.reload();await settle(page);await measure(page,role,surface+'/settings','standalone-feature-simulation')
    await shot(page,`${role}-standalone-375`)
    await page.setViewportSize({width:683,height:384})
    await measure(page,role,surface+'/settings','200-percent-reflow-equivalent')
    await context.close(); console.log(`${stage}: ${role} ${routes.length} routes audited`)
  }
} finally {
  save();await browser.close()
}
console.log(JSON.stringify({stage,rows:report.rows.length,failures:report.rows.filter(r=>r.result==='FAIL').length,errors:report.errors.length,console:report.console.length,http:report.http.length,interactions:report.interactions},null,2))
if(stage==='after') {
  assert.ok(report.rows.every(row=>row.result==='PASS'),'Every measured layout must pass')
  assert.ok(report.interactions.every(row=>row.pass),'Every role interaction must pass')
  assert.equal(report.errors.length,0,'No uncaught browser errors')
  assert.ok(report.http.every(row=>row.role==='anonymous'&&row.path==='/auth/v1/token'&&row.status===400),'Only the intentional invalid-login request may fail')
  assert.ok(report.console.every(row=>row.role==='anonymous'&&row.route==='/login'&&row.message.includes('400 (Bad Request)')),'No unexpected console errors')
}
