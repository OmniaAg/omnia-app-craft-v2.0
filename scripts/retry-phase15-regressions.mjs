import { spawn,execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync,openSync,closeSync } from 'node:fs'
import { dirname,resolve } from 'node:path'
const npm=process.env.npm_execpath??resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const file='artifacts/phase-15/regressions-gates.json',results=JSON.parse(readFileSync(file,'utf8'))
for(let index=0;index<results.length;index++) {
 const previous=results[index]
 if(previous.passed||!/^test:(automations|integrations|ai)$/.test(previous.command))continue
 const start=Date.now();let passed=false,output='',server
 const descriptor=openSync(`artifacts/phase-15/${previous.command.replace(':','-')}-runtime.log`,'w')
 try {
  output=execFileSync(process.execPath,[npm,'run','db:reset'],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']})
  server=spawn(process.execPath,['node_modules/supabase/dist/supabase.js','functions','serve','--env-file','supabase/.env.phase14-test.local'],{windowsHide:true,stdio:['ignore',descriptor,descriptor]})
  let ready=false;const deadline=Date.now()+45000
  while(Date.now()<deadline) {
   try{const response=await fetch('http://127.0.0.1:56321/functions/v1/automation-api',{method:'OPTIONS',headers:{Origin:'http://localhost:53170'},signal:AbortSignal.timeout(2000)});if(response.status===204){ready=true;break}}catch{/* Bounded gateway readiness. */}
   await new Promise(resolve=>setTimeout(resolve,150))
  }
  if(!ready)throw new Error('Local Function runtime did not become ready')
  output+=execFileSync(process.execPath,[npm,'run',previous.command],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});passed=true
 }catch(error){output+=String(error.stdout??'')+'\n'+String(error.stderr??error.message??'')}
 finally{
  if(server?.pid)try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore'});else server.kill()}catch{/* Process may already have exited. */}
  closeSync(descriptor)
 }
 writeFileSync(`artifacts/phase-15/${previous.command.replace(':','-')}-retry.log`,output)
 results[index]={command:previous.command,passed,seconds:(Date.now()-start)/1000,previousAttempt:previous,evidence:`${previous.command.replace(':','-')}-retry.log`}
 writeFileSync(file,JSON.stringify(results,null,2));console.log(`${previous.command}: ${passed?'PASS':'FAIL'}`)
}
if(results.some(row=>!row.passed))process.exitCode=1
