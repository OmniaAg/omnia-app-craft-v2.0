import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
// Preview serves public copied artifacts from dist; this fixture contains UUIDs
// only and exists solely during the local QA command. Never enters precache.
const distPath='dist/phase14-smoke-fixture.json'
writeFileSync(distPath,readFileSync('artifacts/phase-14/browser-smoke-fixture.json'))
try {
  let output
  try { output=execFileSync('cmd.exe',['/d','/s','/c','playwright-cli.cmd -s=phase14-smoke run-code --filename=scripts/qa-phase14-browser-smoke.js'],{encoding:'utf8',timeout:120_000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}) }
  catch (error) { output=String(error.stdout ?? '### Error\nBrowser smoke process failed') }
  const raw=output.match(/### Result\r?\n([\s\S]*?)(?=\r?\n###|$)/)?.[1]
  if (!raw) throw new Error(output.match(/### Error\r?\n([\s\S]*?)(?=\r?\n###|$)/)?.[1] ?? 'No browser smoke result')
  const result=JSON.parse(raw)
  writeFileSync('artifacts/phase-14/browser-smoke.json',JSON.stringify(result,null,2))
  console.log(`PASS: ${result.passed} authenticated deep-link/offline/permission browser checks`)
} finally { unlinkSync(distPath) }
