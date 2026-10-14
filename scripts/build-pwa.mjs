import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const hash = data => createHash('sha256').update(data).digest('hex')
const manifest=JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'))
const shell=new Set(['index.html','manifest.webmanifest','favicon-16.svg','favicon-32.svg',...readdirSync('dist/icons').map(file=>`icons/${file}`)])
const seen=new Set()
function include(key) {
 if(seen.has(key))return
 seen.add(key)
 const entry=manifest[key]
 if(!entry)throw new Error(`Missing shell manifest entry: ${key}`)
 shell.add(entry.file)
 for(const file of [...(entry.css??[]),...(entry.assets??[])])shell.add(file)
 for(const dependency of entry.imports??[])include(dependency)
}
include('index.html')
for(const key of Object.keys(manifest))if(/^src\/features\/auth\/screens\//.test(key))include(key)
// Only bootstrap/auth/error resources are needed for the offline shell.
// Private operational routes are online-only and never cached on demand.
const files=[...shell].sort()
const assets = Object.fromEntries(files.map(file => [`/${file}`, hash(readFileSync(`dist/${file}`))]))
const template = readFileSync('src/features/pwa/service-worker.js','utf8')
const version = hash(JSON.stringify(assets) + template).slice(0,20)
mkdirSync('artifacts/phase-14',{recursive:true})
writeFileSync('dist/sw.js', `const BUILD_VERSION = ${JSON.stringify(version)};\nconst STATIC_ASSETS = ${JSON.stringify(assets)};\n${template}`)
writeFileSync('artifacts/phase-14/precache.json', JSON.stringify({ version, assets }, null, 2))
console.log(`PWA ${version}: ${files.length} build-owned static resources; private requests bypass.`)
