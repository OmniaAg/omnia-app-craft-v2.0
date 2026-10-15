import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const base='http://127.0.0.1:53170', dir='artifacts/final-visual-qa/after'
const browser=await chromium.launch({headless:true}), checks=[], errors=[]
async function shot(page,name) {await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${dir}/${name}.png`,fullPage:true})}
try {
  for(const role of ['director','pm','contributor','adminA']) {
    const context=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'block'})
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
    await page.goto(base+'/login');await page.locator('#login-email').fill(TEST_USERS[role][1]);await page.locator('#login-password').fill(TEST_PASSWORD)
    await page.getByRole('button',{name:'Entrar a OMNIA'}).click()
    const surface=role==='adminA'?'/portal':'/app'
    await page.waitForURL('**'+surface)
    await page.goto(base+'/');await page.waitForURL('**'+surface)
    await page.locator('h1').first().waitFor();await page.waitForLoadState('networkidle')
    checks.push({role,name:'Root resolves authorized context',pass:new URL(page.url()).pathname===surface})
    let capturedNotifications
    await page.route('**/rest/v1/notifications?*',async route=>{
      if(route.request().method()!=='GET')return route.continue()
      const response=await route.fetch()
      const body=await response.body()
      if(response.ok())capturedNotifications=JSON.parse(body.toString())
      await route.fulfill({response,body})
    })
    await page.goto(base+surface+'/notifications')
    await page.locator('.messaging-notification-list').first().waitFor()
    for(let attempt=0;!capturedNotifications&&attempt<30;attempt++)await page.waitForTimeout(100)
    assert.ok(capturedNotifications,'Real notifications response must be read')
    const notifications=capturedNotifications
    await page.unroute('**/rest/v1/notifications?*')
    if(notifications.length) {
      await page.goto(`${base}${surface}/push/${notifications[0].id}`)
      await page.waitForURL(url=>!url.pathname.includes('/push/'))
      await page.locator('h1').first().waitFor()
      checks.push({role,name:'Push resolver reaches authorized destination',pass:new URL(page.url()).pathname.startsWith(surface),target:new URL(page.url()).pathname})
    } else checks.push({role,name:'Push resolver real notification',result:'NOT APPLICABLE',reason:'This fixture has no notifications'})
    const paths=role==='director'?['/app','/app/billing','/app/messages','/app/automations']:role==='adminA'?['/portal','/portal/messages']:['/app','/app/messages']
    for(const path of paths) {
      await page.goto(base+path);await page.locator('h1').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450)
      for(const [width,height] of role==='director'||role==='adminA'?[[375,667],[1366,768]]:[[375,667]]) {
        await page.setViewportSize({width,height});await page.waitForTimeout(400)
        await shot(page,`${role}-${path.replaceAll('/','-')}-${width}`)
      }
    }
    await page.setViewportSize({width:375,height:667});await page.goto(base+surface+'/messages');await page.locator('h1').first().waitFor();await page.waitForTimeout(400)
    const channel=page.locator('.messaging-channel').first()
    if(await channel.count()) {
      await channel.click();await page.locator('#message-body').fill('QA visual local: borrador sin enviar. '.repeat(8))
      await shot(page,`${role}-conversation-375`)
    }
    await context.close()
  }
} finally {await browser.close();writeFileSync(`${dir}/navigation.json`,JSON.stringify({checks,errors},null,2))}
assert.equal(errors.length,0)
assert.ok(checks.every(row=>row.pass||row.result==='NOT APPLICABLE'))
console.log(checks)
