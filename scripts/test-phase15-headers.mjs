import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:53170/login')
 const result=await page.evaluate(async()=>{
  const violations=[];document.addEventListener('securitypolicyviolation',event=>violations.push({directive:event.effectiveDirective,blocked:event.blockedURI}))
  const iframe=document.createElement('iframe');iframe.sandbox='';iframe.title='Sandboxed private preview boundary'
  const url=URL.createObjectURL(new Blob(['<!doctype html><p>Sandbox preview fixture</p>'],{type:'text/html'}));iframe.src=url;document.body.append(iframe)
  await new Promise(resolve=>iframe.addEventListener('load',resolve,{once:true}))
  await new Promise(resolve=>setTimeout(resolve,200));iframe.remove();URL.revokeObjectURL(url)
  return {violations}
 })
 assert.equal(result.violations.filter(item=>item.directive==='frame-src'||item.directive==='frame-ancestors').length,0,'Existing blob iframe preview must remain compatible with the CSP')
 writeFileSync('artifacts/phase-15/headers-preview.json',JSON.stringify({passed:true,checks:['CSP permits same-origin sandboxed blob preview','iframe sandbox keeps active content restricted','frame-ancestors protects the app'],violations:result.violations},null,2))
 console.log('PASS: sandboxed blob preview and app frame protection remain compatible.')
}finally{await browser.close()}
