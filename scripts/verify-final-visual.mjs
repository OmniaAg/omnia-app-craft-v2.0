import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const folder = 'artifacts/final-visual-qa/verification'
mkdirSync(folder, {recursive:true})
const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const frontend = process.argv.includes('--frontend')
const suites = frontend ? ['typecheck','lint','test','build'] : ['db:test','test:auth','test:work','test:deliverables','test:files','test:portal','test:messaging','test:billing','test:pwa','test:push']
const results=[]
for(const suite of suites) {
  const start=Date.now()
  const run=spawnSync(process.execPath,[npm,'run',suite],{encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024})
  const output=(run.stdout??'')+(run.stderr??'')+(run.error?.message??'')
  writeFileSync(`${folder}/${suite.replaceAll(':','-')}.log`,output)
  results.push({command:`npm run ${suite}`,exitCode:run.status,pass:run.status===0,seconds:(Date.now()-start)/1000})
  writeFileSync(`${folder}/${frontend?'frontend':'backend'}.json`,JSON.stringify(results,null,2))
  console.log(`${suite}: ${run.status===0?'PASS':'FAIL'} (${results.at(-1).seconds.toFixed(1)}s)`)
}
process.exitCode=results.every(result=>result.pass)?0:1
