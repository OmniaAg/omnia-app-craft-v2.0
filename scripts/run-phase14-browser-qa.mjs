import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
let output
try { output=execFileSync('cmd.exe',['/d','/s','/c','playwright-cli.cmd -s=phase14 run-code --filename=scripts/qa-phase14-playwright.js'],{encoding:'utf8',timeout:240_000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']}) }
catch (error) { output=String(error.stdout ?? '### Error\nBrowser QA process failed.') }
const raw=output.match(/### Result\r?\n([\s\S]*?)(?=\r?\n###|$)/)?.[1]
if (!raw) throw new Error(output.match(/### Error\r?\n([\s\S]*?)(?=\r?\n###|$)/)?.[1] ?? 'No completed QA result')
const result=JSON.parse(raw)
writeFileSync('artifacts/phase-14/browser-qa.json',JSON.stringify(result,null,2))
if (!result.passed || result.runtimeErrors.length) throw new Error('Browser QA has runtime errors or incomplete checks')
console.log(`PASS: ${result.passed} browser checks; findings=${result.findings.length}; runtime errors=${result.runtimeErrors.length}`)
