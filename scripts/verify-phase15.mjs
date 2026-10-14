import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const npm=process.env.npm_execpath??resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const folder='artifacts/phase-15';mkdirSync(folder,{recursive:true})
const results=[],mode=process.argv.includes('--regressions')?'regressions':process.argv.includes('--frontend')?'frontend':'backend'
function run(name,program=process.execPath,args=[npm,'run',name]) {
 const started=Date.now();let output='',passed=false
 try {output=execFileSync(program,args,{encoding:'utf8',timeout:360000,maxBuffer:24*1024*1024,stdio:['ignore','pipe','pipe']});passed=true}
 catch(error){output=String(error.stdout??'')+'\n'+String(error.stderr??'')}
 writeFileSync(`${folder}/${name.replaceAll(':','-')}.log`,output)
 results.push({command:name,passed,seconds:(Date.now()-started)/1000})
 writeFileSync(`${folder}/${mode}-gates.json`,JSON.stringify(results,null,2))
 console.log(`${name}: ${passed?'PASS':'FAIL'} (${results.at(-1).seconds.toFixed(1)}s)`)
 return passed
}
if(mode==='regressions') {
 for(const suite of ['test:connectivity','test:auth','test:crm','test:work','test:dashboard','test:editorial','test:deliverables','test:files','test:portal','test:messaging','test:billing','test:analytics','test:automations','test:integrations','test:ai']) {
  if(!run('db:reset'))break
  if(suite==='test:messaging')run('realtime-readiness',process.execPath,['scripts/warm-local-realtime.mjs'])
  run(suite)
 }
 run('db:reset')
} else if(mode==='frontend') {
 for(const name of ['typecheck','lint','test','build','test:pwa'])run(name)
} else {
 if(run('db:start')&&run('db:reset')) {
  for(const name of ['db:test','db:lint','db:types','db:types:check'])run(name)
  run('advisors',process.execPath,['node_modules/supabase/dist/supabase.js','db','advisors','--local','--type','all','--level','warn','--fail-on','error'])
 }
}
if(results.some(result=>!result.passed))process.exitCode=1
