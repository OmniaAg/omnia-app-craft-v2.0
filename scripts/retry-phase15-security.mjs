import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { dirname,resolve } from 'node:path'
const npm=process.env.npm_execpath??resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const file='artifacts/phase-15/security-gates.json',results=JSON.parse(readFileSync(file,'utf8'))
const scripts={http:'scripts/test-security-integration.mjs',concurrency:'scripts/test-concurrency-phase15.mjs',push:'scripts/test-push-integration.mjs'}
for(let index=0;index<results.length;index++) {
 const previous=results[index]
 if(previous.passed||!scripts[previous.name])continue
 const start=Date.now();let passed=false,output=''
 try{
  output=execFileSync(process.execPath,[npm,'run','db:reset'],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']})
  output+=execFileSync(process.execPath,[scripts[previous.name]],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});passed=true
 }catch(error){output+=String(error.stdout??'')+'\n'+String(error.stderr??'')}
 writeFileSync(`artifacts/phase-15/security-${previous.name}-retry.log`,output)
 results[index]={name:previous.name,passed,seconds:(Date.now()-start)/1000,previousAttempt:previous,evidence:`security-${previous.name}-retry.log`}
 writeFileSync(file,JSON.stringify(results,null,2));console.log(`${previous.name}: ${passed?'PASS':'FAIL'}`)
}
if(results.some(row=>!row.passed))process.exitCode=1
