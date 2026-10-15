import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { TEST_PASSWORD, TEST_USERS } from './test-fixtures/credentials.mjs'

const extension=resolve('artifacts/final-visual-qa/zoom-extension')
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:null,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--window-size=1366,768']})
const report=[]
try {
  const page=context.pages()[0]??await context.newPage()
  await page.goto('http://127.0.0.1:53170/login')
  await page.locator('.auth-submit').waitFor()
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker')
  const zoom=await worker.evaluate(async()=>{
    const [tab]=await chrome.tabs.query({url:'http://127.0.0.1:53170/*'})
    await chrome.tabs.setZoom(tab.id,2)
    return chrome.tabs.getZoom(tab.id)
  })
  assert.equal(zoom,2)
  await page.waitForTimeout(400)
  for(const path of ['/login','/forgot-password']) {
    await page.goto('http://127.0.0.1:53170'+path);await page.locator('h1').waitFor()
    const box=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}))
    assert.ok(box.scrollWidth<=box.width)
    const submit=page.locator('.auth-submit');await submit.scrollIntoViewIfNeeded()
    const reachable=await submit.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})
    assert.ok(reachable)
    report.push({path,zoom,...box,submitReachable:reachable})
    await page.screenshot({path:`artifacts/final-visual-qa/after/zoom-200-${path.slice(1)}.png`,fullPage:true})
  }
  for(const role of ['director','adminA']) {
    await page.goto('http://127.0.0.1:53170/login')
    await page.locator('#login-email').fill(TEST_USERS[role][1]);await page.locator('#login-password').fill(TEST_PASSWORD)
    await page.getByRole('button',{name:'Entrar a OMNIA'}).click();await page.waitForURL(role==='director'?'**/app':'**/portal')
    for(const path of role==='director'?['/app','/app/billing','/app/analytics','/app/messages','/app/settings']:['/portal','/portal/projects','/portal/messages','/portal/settings']) {
      await page.goto('http://127.0.0.1:53170'+path);await page.locator('h1').first().waitFor();await page.waitForTimeout(500)
      const box=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}))
      report.push({role,path,zoom,...box});assert.ok(box.scrollWidth<=box.width,`${path} must reflow at browser zoom 200%`)
    }
    const menu=page.getByRole('button',{name:role==='director'?'Menú':'Menú del portal',exact:true})
    await menu.click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).first().click();await page.waitForURL('**/login')
  }
} finally {
  writeFileSync('artifacts/final-visual-qa/after/browser-zoom.json',JSON.stringify(report,null,2))
  await context.close()
}
console.log(report)
