import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
import {getLocalSupabaseStatus} from './lib/local-supabase.mjs'
import {TEST_PASSWORD,TEST_USERS} from './test-fixtures/credentials.mjs'

const status=getLocalSupabaseStatus(),base='http://localhost:53170',dir='artifacts/ux-refactor/auth-qa'
mkdirSync(dir,{recursive:true})
const api=createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const unwrap=({data,error})=>{if(error)throw error;return data}
const session=unwrap(await api.auth.signInWithPassword({email:TEST_USERS.director[1],password:TEST_PASSWORD})).session
const email=`ux-browser-${Date.now()}@omnia.local`
const report={checks:[],states:[],errors:[]}
const check=(name,value=true)=>{report.checks.push({name,pass:Boolean(value)});assert.ok(value,name)}
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({serviceWorkers:'block'})
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message))
async function mailLink(after){
 for(let n=0;n<80;n++){
  const list=await (await fetch(new URL('/api/v1/messages',status.MAILPIT_URL))).json()
  const found=list.messages?.find(x=>new Date(x.Created).getTime()>=after-1000&&x.To?.some(t=>t.Address===email))
  if(found){const detail=await (await fetch(new URL('/api/v1/message/'+found.ID,status.MAILPIT_URL))).json();const text=[detail.Text,detail.HTML].join('\n');return text.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/i)[0].replaceAll('&amp;','&').replaceAll('&#38;','&')}
  await page.waitForTimeout(250)
 }
 throw new Error('Local test email did not arrive')
}
async function shot(name){for(const [width,height]of [[320,568],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]){await page.setViewportSize({width,height});await page.waitForTimeout(180);const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);report.states.push({name,width,scroll,pass:scroll<=width+1});if([375,1440].includes(width))await page.screenshot({path:`${dir}/${name}-${width}.png`,fullPage:true})}}
try{
 const sentAt=Date.now()
 const response=await fetch(status.API_URL+'/functions/v1/invite-user',{method:'POST',headers:{apikey:status.PUBLISHABLE_KEY,authorization:'Bearer '+session.access_token,'content-type':'application/json',origin:base},body:JSON.stringify({kind:'internal',email,agencyRoleKey:'contributor',departmentKey:'LUX',classification:'employee',idempotencyKey:randomUUID()})})
 assert.equal(response.status,201,'Local invitation creates authorized contributor')
 await page.goto(await mailLink(sentAt));await page.getByRole('heading',{name:'Activa tu acceso',exact:true}).waitFor();await page.locator('#invite-password').waitFor()
 await page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await page.locator('[aria-invalid=true]').first().waitFor();await shot('invite-validation')
 await page.locator('#invite-password').fill(TEST_PASSWORD);await page.locator('#invite-password-confirmation').fill(TEST_PASSWORD);await page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await page.waitForURL('**/app');check('Valid invitation form activates exact server-assigned role')
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.waitForURL('**/login');await page.goto(base+'/forgot-password');await page.locator('#recovery-email').fill('invalid');await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();await page.locator('[aria-invalid=true]').waitFor();await shot('recovery-validation')
 const recoveryAt=Date.now();await page.locator('#recovery-email').fill(email);await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();await page.getByRole('heading',{name:'Revisa tu bandeja local',exact:true}).waitFor();await shot('recovery-sent');check('Recovery request returns neutral success and sends local email')
 await page.goto(await mailLink(recoveryAt));await page.locator('#new-password').waitFor();await page.locator('#new-password').fill(TEST_PASSWORD+'R2');await page.locator('#confirm-password').count().then(async n=>{await page.locator(n?'#confirm-password':'#new-password-confirmation').fill('Mismatch123')});await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await page.locator('[aria-invalid=true]').first().waitFor();await shot('password-mismatch');await page.locator('#confirm-password').count().then(async n=>{await page.locator(n?'#confirm-password':'#new-password-confirmation').fill(TEST_PASSWORD+'R2')});await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await page.waitForURL('**/app');check('Recovery form validates confirmation and saves new password')
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.waitForURL('**/login');await page.locator('#login-email').fill(email);await page.locator('#login-password').fill(TEST_PASSWORD+'R2');await page.getByRole('button',{name:'Entrar a OMNIA'}).click();await page.waitForURL('**/app');check('Recovered account authenticates with changed password')
 check('No runtime or responsive errors',!report.errors.length&&report.states.every(x=>x.pass))
}catch(error){report.failure=error.message;await page.screenshot({path:`${dir}/failure.png`,fullPage:true});throw error}
finally{writeFileSync(`${dir}/results.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify({checks:report.checks.length,states:report.states.length}))
