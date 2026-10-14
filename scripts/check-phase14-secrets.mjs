import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
const env=readFileSync('supabase/.env.phase14-test.local','utf8')
const secrets=['VAPID_PRIVATE_KEY','VAPID_SUBJECT','PUSH_WORKER_TOKEN'].map(name => [name,env.match(new RegExp(`^${name}=(.+)$`,'m'))?.[1]])
const files=['dist/index.html','dist/sw.js','dist/manifest.webmanifest',...readdirSync('dist/assets').filter(name => /\.(js|css)$/.test(name)).map(name => `dist/assets/${name}`)]
for (const [name,value] of secrets) {
  assert.ok(value,`test server env must define ${name}`)
  for (const file of files) assert.ok(!readFileSync(file,'utf8').includes(value),`${name} leaked in ${file}`)
}
assert.ok(!readFileSync('src/features/pwa/service-worker.js','utf8').includes('localStorage'))
writeFileSync('artifacts/phase-14/secret-scan.json',JSON.stringify({passed:true,files:files.length,serverValuesChecked:secrets.map(([name]) => name),secretValuesPrinted:false},null,2))
console.log(`PASS: ${files.length} build files exclude server VAPID private key, subject and worker token.`)
