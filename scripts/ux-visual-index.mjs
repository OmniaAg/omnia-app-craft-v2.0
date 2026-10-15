import {readdirSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {chromium} from 'playwright'

const root='artifacts/ux-refactor',out=root+'/review';mkdirSync(out,{recursive:true})
const folders=['after','functional','secondary','accessibility','auth-qa','state-qa','verification']
const files=folders.flatMap(folder=>readdirSync(root+'/'+folder).filter(name=>name.endsWith('.png')&&!/failure|probe/.test(name)).map(name=>folder+'/'+name))
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const pages=[]
for(let n=0;n<files.length;n+=12)pages.push(files.slice(n,n+12))
const html='<!doctype html><meta charset="utf-8"><title>OMNIA — evidencia visual</title><style>body{margin:24px;font:14px Arial;background:#eee;color:#161616}h1{font-size:24px}.sheet{width:1600px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:30px;background:#ddd;padding:12px;box-sizing:border-box}figure{margin:0;background:white;min-width:0;height:420px;display:flex;flex-direction:column}figcaption{padding:8px;font:12px monospace;overflow-wrap:anywhere}figure a{flex:1;min-height:0;display:flex;justify-content:center}img{max-width:100%;height:100%;object-fit:contain}</style><h1>OMNIA Craft · capturas reales de revisión</h1><p>Las miniaturas enlazan al PNG completo. Los registros UX/QA son fixtures locales. No incluyen campos de secreto legibles.</p><p>Se conserva el historial de recorridos. Las capturas verification/crm-complete-tabs, verification/message-composer y verification/work-choices confirman las correcciones CSS finales y sustituyen el aspecto anterior de esos componentes. El resto de los datos del recorrido conserva su valor funcional. Consulta VISUAL_QA_REPORT.md.</p>'+pages.map((page,i)=>'<section class="sheet" aria-label="Hoja '+(i+1)+'">'+page.map(file=>'<figure><figcaption>'+escape(file)+'</figcaption><a href="../'+escape(file)+'"><img src="../'+escape(file)+'"></a></figure>').join('')+'</section>').join('')
writeFileSync(out+'/gallery.html',html)
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1680,height:1900}})
try{await p.goto(pathToFileURL(resolve(out+'/gallery.html')).href);await p.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));for(let n=0;n<pages.length;n++)await p.locator('.sheet').nth(n).screenshot({path:`${out}/sheet-${String(n+1).padStart(2,'0')}.png`})}
finally{await b.close()}
writeFileSync(out+'/manifest.json',JSON.stringify({files,sheets:pages.map((files,n)=>({sheet:`sheet-${String(n+1).padStart(2,'0')}.png`,files}))},null,2))
console.log(JSON.stringify({captures:files.length,sheets:pages.length}))
