import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {TEST_PASSWORD,TEST_USERS as BASE} from './test-fixtures/credentials.mjs'

const users={...BASE,developer:['10000000-0000-0000-0000-00000000d001','ux.developer@omnia.local']}
const base=process.env.QA_BASE_URL??'http://127.0.0.1:53170',dir='artifacts/ux-refactor/functional'
mkdirSync(dir,{recursive:true})
const only=process.env.QA_SECTIONS?.split(',')
const report=only?JSON.parse(readFileSync(`${dir}/results.json`,'utf8')):{checks:[],states:[],errors:[],fixtures:{},limitations:[]}
if(only){report.checks=report.checks.filter(x=>!only.includes(x.name));if(only.includes('project-work'))report.states=report.states.filter(x=>!/^project-|^work-/.test(x.name))}
const save=()=>writeFileSync(`${dir}/results.json`,JSON.stringify(report,null,2))
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
let page=await context.newPage()
let role='developer'
page.on('pageerror',e=>report.errors.push({role,path:new URL(page.url()).pathname,message:e.message}))
page.on('dialog',dialog=>dialog.accept())
const marker=`UX ${Date.now()}`
const project='/app/projects/60000000-0000-0000-0000-0000000000a1'
const check=(name,pass=true)=>{report.checks.push({name,pass,role,path:new URL(page.url()).pathname});save();assert.ok(pass,name)}
async function go(path){await page.goto(base+path);await page.locator('main').waitFor();await page.waitForTimeout(700)}
async function login(actor){role=actor;await go('/login');await page.locator('#login-email').fill(users[actor][1]);await page.locator('#login-password').fill(TEST_PASSWORD);await page.getByRole('button',{name:'Entrar a OMNIA'}).click();await page.waitForURL(`**/${actor==='adminA'||actor==='reviewerA'?'portal':'app'}`);await page.waitForTimeout(600)}
async function state(name,form=page.locator('main')){
  for(const [width,height]of [[320,568],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(450)
    const result=await form.evaluate(el=>{
      const controls=[...el.querySelectorAll('input:not([type=hidden]),textarea,select,button,summary')].filter(x=>x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden')
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:controls.map(x=>({tag:x.tagName,name:x.getAttribute('aria-label')||x.labels?.[0]?.textContent?.trim()||x.textContent?.trim(),disabled:x.disabled??false})),unnamed:controls.filter(x=>x.tagName!=='BUTTON'&&x.tagName!=='SUMMARY'&&!x.labels?.length&&!x.getAttribute('aria-label')).map(x=>x.name)}
    })
    report.states.push({name,role,path:new URL(page.url()).pathname,...result,pass:result.scrollWidth<=width+1&&!result.unnamed.length})
    if(width===375||width===1440)await page.screenshot({path:`${dir}/${name}-${width}.png`,fullPage:true})
  }
  await page.setViewportSize({width:1440,height:900});save()
}
async function rpc(name,action){const response=page.waitForResponse(r=>r.url().includes(`/rpc/${name}`)&&r.request().method()==='POST');await action();const r=await response;assert.ok(r.ok(),`${name} returned ${r.status()}`);return r.json()}
async function section(name,fn){if(only&&!only.includes(name))return;try{await fn();console.log(`PASS ${name}`)}catch(e){report.checks.push({name,pass:false,error:e.message});await page.screenshot({path:`${dir}/failure-${name}.png`,fullPage:true}).catch(()=>{});save();console.log(`FAIL ${name}: ${e.message.slice(0,180)}`)}}
try{
await login('developer')
await section('dashboard',async()=>{
 await go('/app');check('Normal dashboard hides configuration controls',await page.locator('.dashboard-toolbox').count()===0)
 await page.getByRole('button',{name:'Personalizar',exact:true}).click();await state('dashboard-customize')
 const add=page.locator('.dashboard-toolbox button').first();if(await add.count()){await add.click();await page.getByText('Cambios guardados.',{exact:true}).waitFor();check('Widget library saves to server')}
 await page.getByRole('button',{name:'Terminar edición',exact:true}).click();await state('developer-dashboard')
})
await section('crm',async()=>{
 await go('/app/crm/accounts');await page.getByRole('button',{name:'Nueva organización',exact:true}).click()
 const form=page.locator('.crm-editor form');await form.getByRole('button',{name:'Crear organización',exact:true}).click();await state('organization-validation',form)
 await form.getByLabel('Nombre',{exact:true}).fill(marker+' organization');await form.getByLabel('Dominio',{exact:true}).fill('ux'+Date.now()+'.example')
 const id=await rpc('create_crm_organization',()=>form.getByRole('button',{name:'Crear organización',exact:true}).click());report.fixtures.organization=id
 await page.waitForURL(`**/accounts/${id}`);check('Organization creation opens its context')
 for(const [tab,field,value,command,submit]of [['Brands','Nombre de marca',marker+' brand','create_brand','Crear marca'],['Contacts','Nombre completo',marker+' contact','create_contact','Crear contacto'],['Opportunities','Oportunidad',marker+' opportunity','create_opportunity','Crear oportunidad'],['Activity','Resumen',marker+' activity','create_crm_activity','Registrar actividad']]){
   await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByLabel(field,{exact:true}).fill(value);await state(`crm-${tab.toLowerCase()}`)
   await rpc(command,()=>page.getByRole('button',{name:submit,exact:true}).click());check(`${tab} saves through authoritative command`)
 }
 await page.getByRole('tab',{name:'Overview',exact:true}).click();await rpc('promote_organization_to_client',()=>page.getByRole('button',{name:'Promover a cliente',exact:true}).click());check('Organization promotion preserves domain requirements')
})
await section('project-work',async()=>{
 await go('/app/projects');await page.getByRole('button',{name:'Nuevo proyecto',exact:true}).click();const form=page.locator('.crm-editor form')
 await form.getByLabel('Nombre',{exact:true}).fill('');await form.getByRole('button',{name:'Crear proyecto',exact:true}).click();await state('project-validation',form)
 await form.getByLabel('Nombre',{exact:true}).fill(marker+' project');await form.getByLabel('Descripción',{exact:true}).fill('Local browser QA project')
 await form.locator('select[name=brandId]').selectOption('31000000-0000-0000-0000-0000000000a1')
 const id=await rpc('create_project',()=>form.getByRole('button',{name:'Crear proyecto',exact:true}).click());report.fixtures.project=id;await page.waitForURL(`**/app/projects/${id}`);check('Project saves with selected authorized brand')
 await go(`/app/projects/${id}`);const milestone=page.locator('form').filter({has:page.getByLabel('Nombre del hito',{exact:true})});await milestone.getByLabel('Nombre del hito').fill(marker+' milestone');await milestone.getByLabel('Fecha límite').fill('2026-12-31');await state('project-members-milestones');await rpc('create_milestone',()=>milestone.getByRole('button',{name:'Crear hito'}).click());check('Milestone saves')
 await go(project+'?tab=work');const work=page.locator('[aria-labelledby=new-work-title] form');await work.getByLabel('Título',{exact:true}).fill(marker+' work');await work.getByLabel('Descripción',{exact:true}).fill('Local UI command failure and recovery')
 await page.route('**/rest/v1/rpc/create_work_item',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Local QA controlled failure'})}))
 await work.getByRole('button',{name:'Crear trabajo',exact:true}).click();await page.getByRole('alert').first().waitFor();check('Failed Work command preserves entered title',await work.getByLabel('Título',{exact:true}).inputValue()===marker+' work');await state('work-command-error',work);await page.unroute('**/rest/v1/rpc/create_work_item')
 const workId=await rpc('create_work_item',()=>work.getByRole('button',{name:'Crear trabajo',exact:true}).click());report.fixtures.work=workId;await page.getByText('Trabajo creado.',{exact:true}).waitFor();check('Work retry succeeds without losing input')
 await go(project+`?tab=work&workItem=${workId}`);await page.locator('.work-panel').waitFor();await state('work-detail');const comment=page.getByLabel('Comentario',{exact:true});await comment.fill(marker+' internal comment');await page.getByRole('button',{name:'Publicar comentario',exact:true}).click();await page.getByText(marker+' internal comment',{exact:true}).waitFor();check('Contextual Work comment appears in history')
})
await section('personal',async()=>{
 await go('/app/my-space');await page.getByRole('button',{name:'Nuevo elemento',exact:true}).click();const form=page.locator('.crm-editor form');await form.getByLabel('Título',{exact:true}).fill(marker+' personal');await form.getByLabel('Detalle',{exact:true}).fill('Private QA task');await state('personal-create',form);await form.getByRole('button',{name:'Crear elemento personal'}).click();await page.getByText('Elemento personal creado.',{exact:true}).waitFor();const row=page.locator('.my-space-item__body').filter({hasText:marker+' personal'}).locator('..');await row.getByRole('button',{name:'Editar',exact:true}).click();await state('personal-edit');await page.locator('.crm-editor form').getByRole('button',{name:'Guardar cambios'}).click();await page.getByText('Elemento personal actualizado.',{exact:true}).waitFor();await row.getByRole('button',{name:'Completar',exact:true}).click();await page.getByText('Elemento personal completado.',{exact:true}).waitFor();check('Personal create edit complete works privately')
})
await section('workflow',async()=>{
 await go('/app/automations?project=60000000-0000-0000-0000-0000000000a1');await page.getByRole('button',{name:'Nuevo workflow',exact:true}).click();const form=page.locator('form.workflow-editor');await form.getByLabel('Nombre',{exact:true}).fill(marker+' workflow')
 await form.getByRole('button',{name:'Añadir condición',exact:true}).click();await form.getByLabel('Operador 1').selectOption('exists');await form.getByLabel('Campo 1').selectOption('project_id');await form.getByRole('button',{name:'Añadir acción',exact:true}).click();await form.getByLabel('Título del trabajo 1',{exact:true}).fill(marker+' action A');await form.getByLabel('Título del trabajo 2',{exact:true}).fill(marker+' action B')
 await form.getByRole('button',{name:'Subir acción 2',exact:true}).click();check('Workflow reorders the underlying sequence',await form.getByLabel('Título del trabajo 1',{exact:true}).inputValue()===marker+' action B')
 await form.getByRole('button',{name:'Vista previa',exact:true}).click();await state('workflow-preview',form)
 await form.getByRole('button',{name:'Quitar acción 2',exact:true}).click();await form.getByRole('button',{name:'Quitar condición 1',exact:true}).click();await form.getByLabel('Disparador').selectOption('manual');await form.getByLabel('Habilitar este workflow y autorizar sus acciones en el proyecto seleccionado').check();await state('workflow-manual',form)
 await form.getByRole('button',{name:'Guardar workflow',exact:true}).click();await page.getByText('Workflow guardado. Puedes cerrar el editor o seguir trabajando.',{exact:true}).waitFor();check('Visual workflow saves original model')
 await form.getByRole('button',{name:'Cerrar editor',exact:true}).click();await page.getByRole('button',{name:`Deshabilitar ${marker} workflow`,exact:true}).click();await page.getByRole('button',{name:`Habilitar ${marker} workflow`,exact:true}).waitFor();await page.getByRole('button',{name:`Habilitar ${marker} workflow`,exact:true}).click();await page.getByRole('button',{name:`Ejecutar ${marker} workflow`,exact:true}).click();await page.getByText('Ejecución registrada. Consulta su estado y sus pasos.',{exact:true}).waitFor();await state('workflow-execution');check('Enable disable execute and execution detail are functional')
})
await section('billing',async()=>{
 await go('/app/billing');await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();const form=page.locator('.billing-editor form');await page.getByLabel('Buscar organización',{exact:true}).fill('Organization A');await page.waitForTimeout(500);await form.locator('[name=organization_id]').selectOption('30000000-0000-0000-0000-00000000000a');await form.getByLabel('Fecha',{exact:true}).fill('2026-10-14');await form.getByLabel('Subtotal',{exact:true}).fill('147.37');await form.getByLabel('Impuesto',{exact:true}).fill('0');await state('billing-create',form)
 await form.getByLabel('Concepto del documento').fill(marker+' service');const response=page.waitForResponse(r=>r.url().includes('/rpc/create_billing_draft')&&r.request().method()==='POST');await form.getByRole('button',{name:'Guardar borrador',exact:true}).click();const created=await response;assert.ok(created.ok());report.fixtures.billing=await created.json();await page.getByText('Borrador de documento guardado.',{exact:true}).waitFor();check('Billing creates selected client document')
 const row=page.locator(`[data-document-id="${report.fixtures.billing}"]`);await row.waitFor();await row.getByRole('button',{name:'Emitir',exact:true}).click();await page.getByText('Documento emitido.',{exact:true}).waitFor();await row.getByRole('button',{name:'Publicar',exact:true}).click();await page.getByText('Documento publicado al cliente.',{exact:true}).waitFor();await row.getByRole('button',{name:'Registrar pago',exact:true}).click();await state('billing-payment');await page.getByLabel('Importe (MXN)',{exact:true}).fill('47.37');await page.locator('[aria-label="Registrar pago"] form').getByRole('button',{name:'Registrar pago',exact:true}).click();await page.getByText('Pago registrado.',{exact:true}).waitFor();check('Billing issue publish and partial payment use explicit forms')
})
await section('editorial',async()=>{
 await go(project+'/editorial');await page.getByRole('button',{name:'Nuevo ciclo',exact:true}).click();let form=page.locator('.editorial-editor form');await form.getByLabel('Nombre del ciclo').fill(marker+' cycle');await form.getByLabel('Inicio',{exact:true}).fill('2026-10-01');await form.getByLabel('Fin',{exact:true}).fill('2026-10-31');await state('editorial-cycle',form);await rpc('create_editorial_cycle',()=>form.getByRole('button',{name:'Guardar ciclo'}).click())
 await page.getByRole('button',{name:'Nueva plantilla',exact:true}).click();form=page.locator('.editorial-editor form');await form.getByLabel('Nombre de plantilla').fill(marker+' template');await form.getByLabel('Canal predeterminado').selectOption({index:1});await form.getByLabel('Formato predeterminado').selectOption('post');await form.getByLabel('Instrucciones predeterminadas').fill('Browser QA template');await state('editorial-template',form);await rpc('create_content_template',()=>form.getByRole('button',{name:'Guardar plantilla'}).click())
 await page.getByRole('button',{name:'Nueva pieza',exact:true}).click();form=page.locator('.editorial-editor form');const cycle=await form.getByLabel('Ciclo').locator('option').filter({hasText:marker+' cycle'}).getAttribute('value');await form.getByLabel('Ciclo').selectOption(cycle)
 await form.getByLabel('Usar plantilla').selectOption({label:marker+' template'});await form.getByLabel('Título editorial').fill(marker+' piece');await form.getByLabel('Fecha',{exact:true}).fill('2026-10-14');await state('editorial-piece',form);await rpc('create_editorial_item',()=>form.getByRole('button',{name:'Crear pieza y trabajo'}).click());check('Cycle template piece create canonical Work')
})
await section('files',async()=>{
 await go('/app/content-manager?project=60000000-0000-0000-0000-0000000000a1');const input=page.locator('input[type=file]');await input.setInputFiles({name:`${marker.replaceAll(' ','-')}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF')});await state('file-upload');await page.getByRole('button',{name:'Subir archivo',exact:true}).click();await page.getByText('Archivo subido y disponible.',{exact:true}).waitFor();const row=page.locator('.file-row').filter({hasText:marker.replaceAll(' ','-')+'.pdf'});await row.locator('summary').click();await state('file-ready-metadata');const download=page.waitForEvent('download');await row.getByRole('button',{name:/Descargar/}).click();await download;check('Private upload and authorized download work')
})
await section('integrations',async()=>{
 await go('/app/integrations?project=60000000-0000-0000-0000-0000000000a1');await page.getByRole('button',{name:'Conectar webhook',exact:true}).click();await page.getByLabel('Nombre de conexión').fill(marker+' connection');await page.getByLabel('Destino HTTPS').fill('https://example.invalid/local-qa');await page.getByLabel('Secreto de firma').fill('local-placeholder-value-with-no-live-credential');await state('integration-write-only');check('Integration credential input is masked',await page.getByLabel('Secreto de firma').getAttribute('type')==='password');await page.getByRole('button',{name:'Cancelar',exact:true}).click()
})
await section('portal',async()=>{
 const other=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});page=await other.newPage();page.on('pageerror',e=>report.errors.push({role,message:e.message}));await login('adminA');await go('/portal/approvals');let link=page.locator('a[href^="/portal/deliverables/"]').first();if(!await link.count()){await go('/portal');link=page.locator('a[href^="/portal/deliverables/"]').first()}assert.ok(await link.count(),'A real published deliverable must exist');await link.click();await page.getByLabel('Escribe un comentario contextual').waitFor();const feedback=page.getByLabel('Escribe un comentario contextual');await feedback.fill(marker+' client feedback');await state('portal-feedback');page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'← Volver al proyecto',exact:true}).click();check('Portal refuses to discard feedback when cancelled',await feedback.inputValue()===marker+' client feedback');await page.getByRole('button',{name:'Enviar comentario',exact:true}).click();await page.getByText('Tu comentario quedó registrado.',{exact:true}).waitFor();check('Client feedback saves and clears unsaved state');await page.getByRole('link',{name:'← Volver al proyecto',exact:true}).click();await page.waitForURL('**/portal/projects/*');check('Saved feedback leaves without another discard prompt');await go('/portal/reports');const reportButton=page.locator('.analytics-report-list button').first();if(await reportButton.count()){await reportButton.click();await state('portal-published-report');check('Published report detail opens')}await other.close()
})
}finally{save();await browser.close()}
console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(x=>!x.pass).length,states:report.states.length,layoutFailures:report.states.filter(x=>!x.pass).length,errors:report.errors.length}))
assert.ok(report.checks.every(x=>x.pass)&&report.states.every(x=>x.pass)&&!report.errors.length,'Functional and visual states must pass')
