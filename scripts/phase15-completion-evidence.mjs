import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
const folder='artifacts/phase-15',read=name=>JSON.parse(readFileSync(`${folder}/${name}`,'utf8'))
const backend=read('backend-gates.json'),frontend=read('frontend-gates.json'),security=read('security-gates.json')
const regressions=read('regressions-gates.json').filter(row=>row.command.startsWith('test:'))
const browser=read('browser-responsive.json'),workflows=read('browser-workflows.json'),performance=read('performance-budgets.json')
const db=Number(readFileSync(`${folder}/db-test.log`,'utf8').match(/Tests=(\d+)/)?.[1])
const unit=Number(readFileSync(`${folder}/test.log`,'utf8').match(/Tests\s+(\d+)\s+passed/)?.[1])
const advisors=read('advisors.log'),restore=read('restore.json'),rotation=read('key-rotation.json'),secrets=read('secret-scan.json')
const http=read('security-http.json'),concurrency=read('concurrency.json'),headers=read('headers-preview.json'),pwa=read('pwa-integration.json'),push=read('push-integration.json')
const visual=read('visual-completion.json'),offlineSecrets=read('secret-scan-offline.json')
const dependencies=read('dependency-audit.json').metadata.vulnerabilities,edgeDependencies=read('edge-dependency-audit.json').metadata.vulnerabilities
const checks={
 backend:backend.length===7&&backend.every(row=>row.passed),
 frontend:frontend.length===5&&frontend.every(row=>row.passed),
 security:security.length===9&&security.every(row=>row.passed),
 regressions:regressions.length===15&&regressions.every(row=>row.passed),
 counts:db===796&&unit===102,
 advisors:advisors.results.every(row=>!['WARN','ERROR'].includes(row.level)),
 browser:browser.passed===117&&workflows.passed===11&&[1440,768,390,375].every(width=>browser.widths.includes(width))&&browser.findings.length===0&&browser.runtimeErrors.length===0&&workflows.errors.length===0&&workflows.consoleErrors.length===0&&workflows.httpErrors.length===0,
 directHttp:http.passed===127&&http.credentialsPrinted===false,
 concurrency:concurrency.passed===12,
 headers:headers.passed===true,
 pwa:pwa.passed===28&&pwa.cacheEntries===38,
 push:push.passed===14&&push.realProviderDelivery===false,
 performance:performance.passed===true&&performance.violations.length===0,
 restore:restore.passed===true&&restore.rlsPreserved&&restore.privilegesPreserved,
 rotation:rotation.passed===true&&rotation.secretsPrinted===false,
 secrets:secrets.passed===true&&secrets.findings.length===0,
 dependencies:dependencies.total===0&&edgeDependencies.total===0,
 loadedDashboard:visual.passed===true&&visual.errors.length===0&&visual.checks.length===4&&visual.checks.every(row=>row.widgets>0&&!row.overflow&&!row.preparing),
 deliveryFiles:offlineSecrets.passed===true&&offlineSecrets.findings.length===0&&offlineSecrets.supabaseStatusKeysChecked===false,
}
const evidence={date:'2026-10-14',scope:'local Phase 15; no commit/deploy/Cloud',head:execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim(),backend,frontend,security,regressions,
 pgTAP:db,unit,advisors:{warnings:advisors.results.filter(row=>row.level==='WARN').length,errors:advisors.results.filter(row=>row.level==='ERROR').length},
 browser:{responsive:browser.passed,roleWorkflows:workflows.passed,widths:browser.widths,findings:browser.findings,runtimeErrors:[...browser.runtimeErrors,...workflows.errors],consoleErrors:workflows.consoleErrors,httpErrors:workflows.httpErrors},
 http:{passed:http.passed,actors:http.actors},concurrency,pwa:{passed:pwa.passed,cacheEntries:pwa.cacheEntries},push:{passed:push.passed,realProviderDelivery:push.realProviderDelivery},headers,
 performance,restore,rotation,secrets,offlineSecrets,visual,dependencies,edgeDependencies,checks,
 remainingManual:['native iOS/Android/desktop Push','production egress/IP connection verification','Cloud/Storage bytes/PITR restore','MFA/session/owners/manual release approval'],
 allAutomatedPassed:Object.values(checks).every(Boolean)}
if(!evidence.allAutomatedPassed)throw new Error('Incomplete Phase 15 evidence: '+JSON.stringify(checks))
writeFileSync(`${folder}/completion-verification.json`,JSON.stringify(evidence,null,2))
console.log(`Verified local Phase 15 evidence: ${db} pgTAP, ${unit} unit, 15 regressions, ${browser.passed} browser checks + ${workflows.passed} workflows.`)
