import { execFileSync } from 'node:child_process'
import { dirname,resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
const npm=process.env.npm_execpath??resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),results=[]
function run(name,args) {
 const start=Date.now();let passed=false,output=''
 try{output=execFileSync(process.execPath,args,{encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});passed=true}
 catch(error){output=String(error.stdout??'')+'\n'+String(error.stderr??'')}
 writeFileSync(`artifacts/phase-15/security-${name}.log`,output)
 results.push({name,passed,seconds:(Date.now()-start)/1000});writeFileSync('artifacts/phase-15/security-gates.json',JSON.stringify(results,null,2))
 console.log(`${name}: ${passed?'PASS':'FAIL'}`);return passed
}
run('sql',['node_modules/supabase/dist/supabase.js','test','db','supabase/tests/database/0015_phase_15_security.test.sql','--local'])
run('unit',['node_modules/vitest/vitest.mjs','run','src/test/phase15-security.test.ts','src/test/phase13-security.test.ts','src/test/auth-provider.test.tsx','src/test/authorization.test.ts','src/test/pwa.test.ts','src/test/analytics.test.ts'])
for(const [name,file]of [['http','scripts/test-security-integration.mjs'],['concurrency','scripts/test-concurrency-phase15.mjs'],['push','scripts/test-push-integration.mjs']]) {
 if(!run(`reset-${name}`,[npm,'run','db:reset']))break
 run(name,[file])
}
run('secret-scan',['scripts/check-phase15-secrets.mjs'])
if(results.some(row=>!row.passed))process.exitCode=1
