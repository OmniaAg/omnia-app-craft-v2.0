import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const hash = data => createHash('sha256').update(data).digest('hex')
const files = ['index.html','manifest.webmanifest','favicon-16.svg','favicon-32.svg',
  ...readdirSync('dist/icons').map(file => `icons/${file}`),
  ...readdirSync('dist/assets').map(file => `assets/${file}`)]
const assets = Object.fromEntries(files.map(file => [`/${file}`, hash(readFileSync(`dist/${file}`))]))
const template = readFileSync('src/features/pwa/service-worker.js','utf8')
const version = hash(JSON.stringify(assets) + template).slice(0,20)
mkdirSync('artifacts/phase-14',{recursive:true})
writeFileSync('dist/sw.js', `const BUILD_VERSION = ${JSON.stringify(version)};\nconst STATIC_ASSETS = ${JSON.stringify(assets)};\n${template}`)
writeFileSync('artifacts/phase-14/precache.json', JSON.stringify({ version, assets }, null, 2))
console.log(`PWA ${version}: ${files.length} build-owned static resources; private requests bypass.`)
