import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Capture CLI output in memory: its echoed source includes a public signing fixture.
let output
try {
  output = execFileSync('cmd.exe', ['/d', '/s', '/c', 'playwright-cli.cmd run-code --filename=scripts/qa-phase13-playwright.js'], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) { output = String(error.stdout ?? '### Error\nBrowser QA process failed.') }
const raw = output.match(/### Result\r?\n([\s\S]*?)(?=\r?\n###|$)/)?.[1]
if (!raw) {
  const error = output.match(/### Error\r?\n([\s\S]*?)(?=\r?\n###|$)/)?.[1] ?? 'CLI returned without a completed result; inspect the local browser.'
  throw new Error(error.replaceAll('phase13-local-test-signing-material-00000000000000', '[fixture]'))
}
const result = JSON.parse(raw)
if (!(result.passed > 0)) throw new Error('QA did not report completed checks')
writeFileSync('artifacts/phase-13/browser-qa.json', JSON.stringify(result, null, 2))
console.log(`PASS: ${result.passed} browser checks; errors=${result.runtimeErrors.length}; HTTP errors=${result.networkErrors.length}; leaks=${result.leaks.length}.`)
console.log(JSON.stringify({ initialRequests: result.initialRequests, phase13Requests: result.phase13Requests }))
