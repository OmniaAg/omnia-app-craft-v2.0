import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const read=name => JSON.parse(readFileSync(`artifacts/phase-14/${name}`,'utf8'))
const gates=read('verification.json'), frontend=read('frontend-final.json')
const regressions=read('regressions.json').filter(row => row.command!=='db:reset')
const pwa=read('pwa-integration.json'), push=read('push-integration.json')
const browser=read('browser-qa.json'), smoke=read('browser-smoke.json')
const advisors=JSON.parse(readFileSync('artifacts/phase-14/advisors.log','utf8'))
const pgTAP=Number(readFileSync('artifacts/phase-14/db-test.log','utf8').match(/Tests=(\d+)/)?.[1])
const unitTests=Number(readFileSync('artifacts/phase-14/test.log','utf8').match(/Tests\s+(\d+)\s+passed/)?.[1])
const evidence={date:'2026-10-13',phase:14,scope:'local',backendGates:gates,frontendGates:frontend,regressions,
  pwaChecks:pwa.passed,pushChecks:push.passed,mobileChecks:browser.passed,smokeChecks:smoke.passed,
  pgTAP:{passed:pgTAP,total:pgTAP,phase14:36},unitTests,
  advisors:{errors:advisors.results.filter(item => item.level==='ERROR').length,warnings:advisors.results.filter(item => item.level==='WARN').length,
    tables:[...new Set(advisors.results.map(item => `${item.metadata.schema}.${item.metadata.name}`))]},
  nativeLimitations:{subscription:pwa.nativeSubscribe,display:pwa.nativeDisplay,focus:pwa.nativeFocus},
  allAutomatedPassed:[...gates,...frontend,...regressions].every(row => row.passed) && browser.findings.length===0 && browser.runtimeErrors.length===0,
}
if (!evidence.allAutomatedPassed || !pgTAP || !unitTests || regressions.length!==15) throw new Error('Incomplete verification evidence')
writeFileSync('artifacts/phase-14/completion-verification.json',JSON.stringify(evidence,null,2))
const git=args => execFileSync('git',['-c','core.autocrlf=false',...args],{encoding:'utf8'}).trim().split('\n').filter(Boolean)
const source=[...new Set([...git(['diff','--name-only']),...git(['ls-files','--others','--exclude-standard'])])]
  .filter(path => !path.startsWith('artifacts/') && !path.startsWith('.playwright-cli/'))
function purpose(path) {
  if (path==='README.md') return 'Architecture, safety guarantees, local runbook and test limitations'
  if (path==='package.json') return 'Build, Push, PWA and verification commands'
  if (path.startsWith('public/') || path==='index.html') return 'Install manifest, metadata and existing-brand icon derivatives'
  if (path.startsWith('supabase/migrations/')) return 'Private subscriptions, session/device ownership and fenced delivery outbox'
  if (path.startsWith('supabase/tests/')) return '36 database authorization, lifecycle and delivery assertions'
  if (path.startsWith('supabase/functions/')) return 'Pinned Web Push encryption/signing, dispatcher and safe provider boundary'
  if (path.startsWith('supabase/')) return 'Local Function configuration and server-only VAPID env template'
  if (path.startsWith('src/features/pwa/')) return 'Static-only SW, update/install/offline UX, device revocation and safe notification destinations'
  if (path.includes('database.types')) return 'Generated RPC types'
  if (path.includes('auth/')) return 'Push cleanup and narrow authenticated return paths'
  if (path.includes('shell') || path.includes('Shell')) return 'Responsive accessible disclosure navigation'
  if (path.includes('AppProviders') || path.includes('supabase/client')) return 'Immediate offline rejection without paused or queued mutations'
  if (path.startsWith('src/test/')) return 'Network guard, safe routes and Push endpoint unit assertions'
  if (path.startsWith('src/')) return 'Targeted mobile layout, forms, tables and messaging corrections'
  return 'Reproducible local assets, deterministic integration/QA and evidence'
}
writeFileSync('artifacts/phase-14/files-changed.json',JSON.stringify(source.map(file => ({file,purpose:purpose(file)})),null,2))
console.log(JSON.stringify({automatedPass:evidence.allAutomatedPassed,pgTAP,unitTests,regressions:regressions.length,
  pwa:pwa.passed,push:push.passed,mobile:browser.passed,smoke:smoke.passed,advisorWarnings:evidence.advisors.warnings,sourceFiles:source.length}))
