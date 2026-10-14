import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const label = process.argv.includes('--before') ? 'before' : 'after'
mkdirSync('artifacts/phase-14', { recursive: true })
const files = readdirSync('dist/assets').filter(file => /^(index-|DeviceSettings-|SettingsScreen-|PwaStatus-).*\.(js|css)$/.test(file))
const bundle = files.map(file => { const data = readFileSync(`dist/assets/${file}`); return { file, bytes: data.length, gzip: gzipSync(data).length } })
if (label === 'after') { const data = readFileSync('dist/sw.js'); bundle.push({ file: 'sw.js', bytes: data.length, gzip: gzipSync(data).length }) }
writeFileSync(`artifacts/phase-14/bundle-${label}.json`, JSON.stringify(bundle, null, 2))
console.log(bundle)
