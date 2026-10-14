import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const label = process.argv.includes('--before') ? 'before' : 'after'
const files = readdirSync('dist/assets').filter(name => /^(index-|AutomationsScreen-|IntegrationsScreen-|ProjectAssistantScreen-|usePhase13Project-).*\.js$/.test(name)
  || name.endsWith('.js') && /phase13_history|p13-page/.test(readFileSync(`dist/assets/${name}`, 'utf8')))
const bundle = files.map(file => { const content = readFileSync(`dist/assets/${file}`); return { file, bytes: content.length, gzip: gzipSync(content).length } })
mkdirSync('artifacts/phase-13', { recursive: true })
writeFileSync(`artifacts/phase-13/bundle-${label}.json`, JSON.stringify(bundle, null, 2))
console.log(bundle)
