import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { getLocalSupabaseStatus } from './lib/local-supabase.mjs'
const offline=process.argv.includes('--offline')
const status=offline?{}:getLocalSupabaseStatus(),secrets=[status.SECRET_KEY,status.SERVICE_ROLE_KEY].filter(Boolean)
for(const file of ['supabase/.env.local','supabase/.env.phase13-test.local','supabase/.env.phase14-test.local','supabase/.env.phase15-rotation-test.local']) {
 if(!existsSync(file))continue
 for(const line of readFileSync(file,'utf8').split(/\r?\n/)) {
  const match=line.match(/^([A-Z_]+)=(.+)$/)
  if(!match||!/PRIVATE|WORKER_TOKEN|ENCRYPTION_KEY|SIGNING_SECRET/.test(match[1]))continue
  if(match[1]==='INTEGRATION_ENCRYPTION_KEYS') {
   try {secrets.push(...Object.values(JSON.parse(match[2])))}catch{throw new Error('Invalid ignored keyring configuration')}
  }else secrets.push(match[2])
 }
}
const textFile=/\.(?:[cm]?[jt]sx?|json|md|sql|toml|ya?ml|html|css|log|txt|webmanifest|svg)$/
const files=new Set(execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>textFile.test(file)))
function walk(folder) {
 for(const name of readdirSync(folder)){const file=`${folder}/${name}`;if(statSync(file).isDirectory())walk(file);else if(textFile.test(file)&&!file.endsWith('.local'))files.add(file)}
}
for(const folder of ['dist','artifacts/phase-15','artifacts/ux-refactor','src','scripts','supabase/functions','supabase/migrations','supabase/tests'])if(existsSync(folder))walk(folder)
const findings=[]
for(const file of files) {
 if(!existsSync(file))continue
 const content=readFileSync(file,'utf8')
 if(secrets.some(value=>typeof value==='string'&&value.length>=16&&content.includes(value)))findings.push({file,kind:'server-secret-value'})
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))findings.push({file,kind:'private-key'})
 if(/\bAKIA[A-Z0-9]{16}\b/.test(content))findings.push({file,kind:'aws-access-key'})
 for(const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]) {
  try {if(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).role==='service_role')findings.push({file,kind:'service-role-jwt'})}catch{/* Non-token fixture. */}
 }
}
const output=offline?'secret-scan-offline.json':'secret-scan.json'
writeFileSync(`artifacts/phase-15/${output}`,JSON.stringify({passed:findings.length===0,files:files.size,serverValues:secrets.length,findings,secretValuesPrinted:false,mode:offline?'offline-local-env-and-token-patterns':'live-local-status-and-env',supabaseStatusKeysChecked:!offline},null,2))
assert.equal(findings.length,0,`Credential exposure locations: ${JSON.stringify(findings)}`)
console.log(`PASS: ${files.size} tracked/source/build/evidence text files; no matched credential exposure (${offline?'offline env values and token patterns; live Supabase status keys not checked':'live local credentials'}).`)
