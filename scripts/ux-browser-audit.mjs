import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TEST_PASSWORD, TEST_USERS as BASE_TEST_USERS } from './test-fixtures/credentials.mjs'
import {createClient} from '@supabase/supabase-js'
import {getLocalSupabaseStatus} from './lib/local-supabase.mjs'
const TEST_USERS={...BASE_TEST_USERS,developer:['10000000-0000-0000-0000-00000000d001','ux.developer@omnia.local','developer']}

const stage = process.argv.includes('--before') ? 'before' : 'after'
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:53170'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local QA only')
const dir = `artifacts/ux-refactor/${stage}`
mkdirSync(dir, { recursive: true })
const inventory = JSON.parse(readFileSync('artifacts/ux-refactor/inventory.json', 'utf8'))
const prior = JSON.parse(readFileSync('artifacts/final-visual-qa/after/measurements.json', 'utf8')).routeInventory
const report = process.env.QA_RESUME ? JSON.parse(readFileSync(`${dir}/browser.json`,'utf8')) : { stage, rows: [], interactions: [], errors: [], authState: {}, limitations: ['Browser automation measures technical behavior, not human task discovery times.'] }
if(process.env.QA_RESUME){for(const key of ['rows','interactions','errors'])report[key]=report[key].filter(row=>!process.env.QA_ROLES.split(',').includes(row.role));report.limitations.push('Client roles resumed on production preview after the development server stopped; completed Internal observations retained.')}
const local=getLocalSupabaseStatus()
const save = () => writeFileSync(`${dir}/browser.json`, JSON.stringify(report, null, 2))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const sizes = stage === 'before' ? [[1440,900],[375,667]] : [[320,568],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]
const roles = process.env.QA_ROLES?.split(',') ?? ['director','developer','pm','contributor','adminA','reviewerA','viewerA']
async function measure(page, role, route, state) {
  const data = await page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
    const label = el => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.innerText || el.name || el.tagName).trim().replace(/\s+/g,' ').slice(0,130)
    const controls = [...document.querySelectorAll('main button,main a,main summary,main input,main select,main textarea')].filter(visible).map(el => ({tag:el.tagName,label:label(el),disabled:el.disabled??false}))
    const nav = [...document.querySelectorAll('header nav')].filter(visible).map(el => ({width:el.clientWidth,scroll:el.scrollWidth}))
    const forms = [...document.querySelectorAll('main form')].filter(visible).map(el => ({fields:[...el.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(visible).map(field=>({label:label(field),name:field.name}))}))
    return { width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent,nav,controls,forms,alerts:[...document.querySelectorAll('[role=alert]')].filter(visible).map(el=>el.textContent.trim()) }
  })
  report.rows.push({ role, route, state, actualPath:new URL(page.url()).pathname, ...data, layoutPass:data.scrollWidth<=data.width+1&&data.nav.every(nav=>nav.scroll<=nav.width+1) })
  save()
}
async function settle(page) {
  await page.locator('main').waitFor({timeout:20000})
  await page.evaluate(()=>document.fonts.ready)
  await page.waitForTimeout(650)
}
try {
  if(!process.env.QA_ROLES) {
    const context=await browser.newContext({serviceWorkers:'block'})
    const page=await context.newPage()
    for(const route of ['/','/login','/forgot-password','/reset-password','/accept-invite','/forbidden','/missing-ux-route']) {
      await page.goto(base+route);await settle(page)
      for(const [width,height]of sizes){await page.setViewportSize({width,height});await page.waitForTimeout(350);await measure(page,'anonymous',route,'default')}
    }
    await context.close()
  }
  for (const role of roles) {
    const context = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
    const page = await context.newPage()
    page.on('pageerror', error => report.errors.push({role,path:new URL(page.url()).pathname,error:error.message}))
    await page.goto(`${base}/login`)
    await page.locator('#login-email').fill(TEST_USERS[role][1])
    await page.locator('#login-password').fill(TEST_PASSWORD)
    await page.getByRole('button',{name:'Entrar a OMNIA'}).click()
    const client = ['adminA','reviewerA','viewerA'].includes(role)
    await page.waitForURL(`**/${client?'portal':'app'}`)
    const seedPaths = prior[role] ?? (client?prior.adminA:prior.director)
    const paths = new Set(seedPaths)
    const token=await page.evaluate(()=>{const entry=Object.entries(localStorage).find(([key])=>key.startsWith('sb-')&&key.endsWith('-auth-token'));return entry?JSON.parse(entry[1]).access_token:null})
    if(!token)throw new Error('Authenticated local QA token unavailable')
    const api=createClient(local.API_URL,local.PUBLISHABLE_KEY,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+token}}})
    const [notifications,reports,channels]=await Promise.all([
        api.from('notifications').select('id').order('created_at',{ascending:false}).limit(1),
        api.rpc('list_project_reports',{p_offset:0}),api.rpc('my_channels'),
      ])
    const dynamic={notification:notifications.data?.[0]?.id,report:reports.data?.items?.[0]?.id,channel:channels.data?.[0]?.id}
    const surface=client?'/portal':'/app'
    if(dynamic.notification)paths.add(`${surface}/push/${dynamic.notification}`)
    if(dynamic.channel)paths.add(`${surface}/messages/${dynamic.channel}`)
    if(client&&dynamic.report)paths.add(`/portal/reports?report=${dynamic.report}`)
    if(!client) {
      for(const section of ['overview','projects','work','editorial','reviews','billing','reports'])paths.add(`/app/analytics?section=${section}`)
      for(const view of ['agenda','calendar'])paths.add(`/app/editorial/calendar?project=60000000-0000-0000-0000-0000000000a1&view=${view}`)
    }
    for(const route of inventory.routes.filter(route=>route.path.startsWith(client?'/portal':'/app')&&route.path.includes(':notificationId')))paths.add(route.path.replace(':notificationId','00000000-0000-0000-0000-000000000000'))
    for (const route of inventory.routes.filter(route=>route.path.startsWith(client?'/portal':'/app')&&!route.path.includes(':'))) paths.add(route.path)
    for (const route of paths) {
      await page.goto(base+route)
      await settle(page)
      for (const [width,height] of sizes) {
        await page.setViewportSize({width,height})
        await page.waitForTimeout(350)
        await measure(page,role,route,'default')
      }
      await page.setViewportSize({width:1440,height:900})
      await page.waitForTimeout(400)
      const id = route.replace(/[^a-zA-Z0-9]+/g,'-')
      if (role==='director'||role==='adminA') await page.screenshot({path:`${dir}/${role}${id}.png`,fullPage:true})
      const tabs = page.locator('main .crm-tabs button,main [role=tab],main .editorial-view-switch button')
      for (let index=0;index<await tabs.count();index++) {
        const button=tabs.nth(index)
        if (!await button.isVisible()||!await button.isEnabled()) continue
        const name=await button.innerText()
        await button.click();await page.waitForTimeout(150)
        await measure(page,role,route,`tab:${name}`)
        report.interactions.push({role,route,action:`tab:${name}`,pass:true})
      }
      const summaries=page.locator('main details > summary')
      for (let index=0;index<await summaries.count();index++) {
        const summary=summaries.nth(index)
        if(!await summary.isVisible())continue
        const name=await summary.innerText()
        await summary.click();await page.waitForTimeout(80)
        await measure(page,role,route,`panel:${name}`)
        await summary.click()
        report.interactions.push({role,route,action:`panel:${name}`,pass:true})
      }
      console.log(`${stage} ${role} ${route}`)
    }
    if (role==='director' && stage==='before') {
      const route=seedPaths.find(path=>path.includes('?tab=work')&&!path.includes('workItem='))
      await page.goto(base+route);await settle(page)
      const title=page.locator('input[name=title]').first()
      if(await title.count()) {
        await title.fill('UX unsaved tab probe')
        const importPath='/src/shared/api/supabase/client.ts'
        await page.evaluate(async path=>{const {getSupabaseClient}=await import(path);await getSupabaseClient().auth.refreshSession()},importPath)
        await page.waitForTimeout(800)
        report.authState.sameActorRefreshPreserved=await page.locator('input[name=title]').first().inputValue()==='UX unsaved tab probe'
        save()
      }
    }
    await context.close()
  }
} finally {save();await browser.close()}
console.log(JSON.stringify({rows:report.rows.length,interactions:report.interactions.length,layoutFailures:report.rows.filter(row=>!row.layoutPass).length,errors:report.errors.length,authState:report.authState}))
