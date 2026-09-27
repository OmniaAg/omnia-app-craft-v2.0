import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { waitForPostgrest } from './lib/local-supabase.mjs'

const users = {
  director: ['10000000-0000-0000-0000-000000000001', 'director@omnia.local'],
  pm: ['10000000-0000-0000-0000-000000000003', 'pm.scoped@omnia.local'],
  contributor: ['10000000-0000-0000-0000-000000000004', 'contributor@omnia.local'],
  other: ['10000000-0000-0000-0000-000000000011', 'contributor.b@omnia.local'],
  client: ['10000000-0000-0000-0000-000000000005', 'client.admin.a@omnia.local'],
  clientB: ['10000000-0000-0000-0000-000000000008', 'client.user.b@omnia.local'],
}
const projectA = '60000000-0000-0000-0000-0000000000a1'
const projectB = '60000000-0000-0000-0000-0000000000b1'
const check = (condition, message) => { if (!condition) throw new Error(message) }
const ok = (result, message) => {
  check(!result.error && result.data !== null, `${message}: ${result.error?.message ?? 'empty response'}`)
  return result.data
}
const denied = (result, message) => check(Boolean(result.error) || !result.data || result.data.length === 0, message)

async function main() {
  const { status } = await waitForPostgrest()
  check(new URL(status.API_URL).hostname === '127.0.0.1', 'local loopback only')
  const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  async function actor([id, email]) {
    const password = `OmniaFiles9!${randomBytes(18).toString('base64url')}`
    ok(await admin.auth.admin.updateUserById(id, { password, email_confirm: true }), `bootstrap ${email}`)
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    check(!(await client.auth.signInWithPassword({ email, password })).error, `login ${email}`)
    return client
  }
  const director = await actor(users.director)
  const pm = await actor(users.pm)
  const contributor = await actor(users.contributor)
  const other = await actor(users.other)
  const client = await actor(users.client)
  const clientB = await actor(users.clientB)
  const workA = ok(await pm.rpc('create_work_item', {
    project_id: projectA, title: `Phase 8 file evidence ${randomUUID()}`, description: '',
    priority: 'normal', due_local: null, milestone_id: null,
    assignee_ids: [users.contributor[0]], idempotency_key: randomUUID(),
  }), 'Phase 8 assigned Work')
  const bucket = ok(await admin.storage.getBucket('project-files'), 'private bucket')
  check(bucket.public === false && bucket.file_size_limit === 52428800, 'bucket privacy or limit incorrect')
  console.log('ok - private bucket and independent actors')

  const pdf = new Blob([new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF')], { type: 'application/pdf' })
  const prepare = (actorClient, projectId, filename = 'evidence.pdf', mime = 'application/pdf', size = pdf.size) =>
    actorClient.rpc('prepare_file_asset', { project_id: projectId, original_filename: filename, mime_type: mime, size_bytes: size })
  denied(await prepare(contributor, projectB), 'cross-project prepare succeeded')
  denied(await prepare(client, projectA), 'client prepare succeeded')
  denied(await prepare(contributor, projectA, '../traversal.pdf'), 'path traversal filename accepted')
  denied(await prepare(contributor, projectA, '..\\evil.pdf'), 'backslash traversal filename accepted')
  denied(await prepare(contributor, projectA, '%2e%2e/evil.pdf'), 'encoded traversal filename accepted')
  denied(await prepare(contributor, projectA, `${'a'.repeat(241)}.pdf`), 'long filename accepted')
  const unicode = ok(await prepare(contributor, projectA, 'evidencia-ñá-📄.pdf'), 'unicode display filename')
  check(unicode.object_path === `${projectA}/${unicode.id}`, 'unicode filename influenced object path')
  denied(await prepare(contributor, projectA, 'script.exe', 'application/pdf'), 'extension mismatch accepted')
  denied(await prepare(contributor, projectA, 'missing.pdf', ''), 'missing MIME accepted')
  denied(await prepare(contributor, projectA, 'empty.pdf', 'application/pdf', 0), 'zero-byte file accepted')
  denied(await prepare(contributor, projectA, 'huge.pdf', 'application/pdf', 52428801), 'oversized file accepted')
  const pending = ok(await prepare(contributor, projectA, 'not-uploaded.pdf'), 'pending asset')
  denied(await contributor.rpc('finalize_file_asset', { asset_id: pending.id }), 'missing object finalized')
  check(!(await contributor.from('file_assets').select('id').eq('id', pending.id).eq('status', 'ready')).data?.length,
    'pending asset appeared ready')
  console.log('ok - prepare validates scope, filename, MIME and size; pending cannot finalize without bytes')

  async function upload(clientForAsset, projectId, filename) {
    const asset = ok(await prepare(clientForAsset, projectId, filename), `prepare ${filename}`)
    check(asset.object_path === `${projectId}/${asset.id}`, 'noncanonical path')
    ok(await clientForAsset.storage.from('project-files').upload(asset.object_path, pdf, {
      contentType: 'application/pdf', upsert: false,
    }), `upload ${filename}`)
    ok(await clientForAsset.rpc('finalize_file_asset', { asset_id: asset.id }), `finalize ${filename}`)
    return asset
  }
  const a = await upload(contributor, projectA, 'evidence-a.pdf')
  const b = await upload(contributor, projectA, 'evidence-b.pdf')
  const duplicateOne = await upload(contributor, projectA, 'same-name.pdf')
  const duplicateTwo = await upload(pm, projectA, 'same-name.pdf')
  check(duplicateOne.id !== duplicateTwo.id && duplicateOne.object_path !== duplicateTwo.object_path,
    'matching display filenames collided in Storage')
  const foreign = await upload(other, projectB, 'foreign.pdf')
  const wrongSize = ok(await prepare(contributor, projectA, 'wrong-size.pdf', 'application/pdf', pdf.size + 1), 'wrong size pending')
  ok(await contributor.storage.from('project-files').upload(wrongSize.object_path, pdf, { contentType: 'application/pdf' }), 'wrong size upload')
  denied(await contributor.rpc('finalize_file_asset', { asset_id: wrongSize.id }), 'claimed size mismatch finalized')
  const wrongMime = ok(await prepare(contributor, projectA, 'wrong-mime.pdf'), 'wrong MIME pending')
  denied(await contributor.storage.from('project-files').upload(wrongMime.object_path, await pdf.arrayBuffer(), {
    contentType: 'application/x-msdownload',
  }), 'forbidden bucket MIME uploaded')
  check((await contributor.from('file_assets').select('id').eq('id', a.id)).data?.length === 1, 'own asset not listed')
  check(!(await other.from('file_assets').select('id').eq('id', a.id)).data?.length, 'foreign metadata visible')
  check(!(await client.from('file_assets').select('id').eq('id', a.id)).data?.length, 'client metadata visible')
  ok(await contributor.storage.from('project-files').download(a.object_path), 'authorized download')
  check(ok(await contributor.storage.from('project-files').list(projectA), 'authorized Storage list')
    .some((object) => object.name === a.id), 'authorized list omitted own asset')
  denied(await other.storage.from('project-files').download(a.object_path), 'cross-project download succeeded')
  denied(await client.storage.from('project-files').download(a.object_path), 'client download succeeded')
  denied(await clientB.storage.from('project-files').download(a.object_path), 'Organization B client download succeeded')
  denied(await other.storage.from('project-files').createSignedUrl(a.object_path, 60), 'foreign signed URL succeeded')
  denied(await contributor.storage.from('project-files').createSignedUrl(a.object_path, 3600), 'signed URL creation should be disabled')
  denied(await other.storage.from('project-files').list(projectA), 'foreign list succeeded')
  denied(await clientB.storage.from('project-files').list(projectA), 'Organization B client list succeeded')
  denied(await other.storage.from('project-files').upload(a.object_path, pdf, { contentType: 'application/pdf', upsert: true }), 'foreign overwrite succeeded')
  denied(await contributor.storage.from('project-files').upload(a.object_path, pdf, { contentType: 'application/pdf', upsert: true }), 'owner overwrite succeeded')
  denied(await other.storage.from('project-files').remove([a.object_path]), 'foreign delete succeeded')
  denied(await other.storage.from('project-files').move(a.object_path, `${projectB}/${randomUUID()}`), 'foreign move succeeded')
  const copyTarget = ok(await prepare(other, projectB, 'copy-target.pdf'), 'copy target')
  denied(await contributor.storage.from('project-files').upload(copyTarget.object_path, pdf, {
    contentType: 'application/pdf',
  }), 'upload to another Project pending path succeeded')
  denied(await other.storage.from('project-files').copy(a.object_path, copyTarget.object_path), 'foreign copy succeeded')
  denied(await contributor.storage.from('project-files').move(a.object_path, `${projectA}/${randomUUID()}`), 'owner move succeeded')
  denied(await director.storage.from('project-files').remove([a.object_path]), 'Director bypassed explicit delete command')
  denied(await contributor.storage.from('project-files').upload(`${projectA}/${randomUUID()}`, pdf, { contentType: 'application/pdf' }), 'arbitrary path upload succeeded')
  denied(await contributor.from('file_assets').update({ status: 'ready' }).eq('id', pending.id), 'direct asset mutation succeeded')
  denied(await contributor.from('deliverable_files').insert({ deliverable_version_id: randomUUID(), asset_id: a.id, ordinal: 1 }), 'direct version link succeeded')
  const cycle = ok(await pm.rpc('create_editorial_cycle', {
    project_id: projectA, name: 'Phase 8 files', start_date: '2030-10-01', end_date: '2030-10-31',
  }), 'editorial cycle')
  const item = ok(await pm.rpc('create_editorial_item', {
    project_id: projectA, cycle_id: cycle, template_id: null, title: 'Phase 8 editorial file', brief: '',
    scheduled_date: '2030-10-15', scheduled_time: null, channel: 'website', format: 'article', idempotency_key: randomUUID(),
  }), 'editorial item')
  ok(await pm.rpc('link_content_asset', { item_id: item, asset_id: a.id }), 'authorized editorial link')
  denied(await pm.rpc('link_content_asset', { item_id: item, asset_id: foreign.id }), 'foreign editorial asset linked')
  denied(await pm.from('content_asset_links').insert({ editorial_item_id: item, asset_id: b.id, project_id: projectA,
    linked_by: users.pm[0] }), 'direct editorial link succeeded')
  console.log('ok - real Storage upload/download, editorial link, cross-project/client isolation, path and overwrite denial')

  const key = randomUUID()
  ok(await director.rpc('configure_review_requirements', {
    project_id: projectA, deliverable_id: null, reviewer_ids: [users.pm[0], users.director[0]], idempotency_key: key,
  }), 'review configuration')
  const deliverable = ok(await contributor.rpc('create_deliverable', {
    work_item_id: workA, title: 'Phase 8 file evidence', idempotency_key: randomUUID(),
  }), 'deliverable')
  denied(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'Foreign file', idempotency_key: randomUUID(), asset_ids: [foreign.id],
  }), 'foreign asset linked')
  denied(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'Pending file', idempotency_key: randomUUID(), asset_ids: [pending.id],
  }), 'pending asset linked')
  check(!(await contributor.from('deliverable_versions').select('id').eq('deliverable_id', deliverable)).data?.length,
    'failed submission created a version')
  const submissionKey = randomUUID()
  const v1 = ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'A and B', idempotency_key: submissionKey, asset_ids: [a.id, b.id],
  }), 'V1 with files')
  check(ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'A and B', idempotency_key: submissionKey, asset_ids: [a.id, b.id],
  }), 'V1 retry') === v1, 'idempotent retry changed version')
  denied(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'A and B', idempotency_key: submissionKey, asset_ids: [a.id],
  }), 'same key with different files accepted')
  const v1Links = ok(await contributor.from('deliverable_files').select('asset_id').eq('deliverable_version_id', v1), 'V1 links')
  check(v1Links.length === 2, 'V1 must link two exact files')
  denied(await contributor.from('deliverable_files').delete().eq('deliverable_version_id', v1), 'browser removed history link')
  denied(await director.rpc('request_file_permanent_delete', { asset_id: a.id }), 'historical asset deletion allowed')
  const detail = ok(await contributor.rpc('deliverable_detail', { work_item_id: workA }), 'V1 detail')
  const pmAssignment = detail.versions[0].round.assignments.find((assignment) => assignment.reviewer_id === users.pm[0])
  ok(await pm.rpc('record_review_decision', {
    review_assignment_id: pmAssignment.id, decision: 'request_changes', reason: 'Revise evidence', idempotency_key: randomUUID(),
  }), 'request changes')
  ok(await pm.rpc('archive_file_asset', { asset_id: a.id }), 'archive historical asset')
  ok(await pm.storage.from('project-files').download(a.object_path), 'historical archived download')
  check(ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'A and B', idempotency_key: submissionKey, asset_ids: [a.id, b.id],
  }), 'V1 retry after archive') === v1, 'archiving a historical file broke the original submission retry')
  denied(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'Archived A', idempotency_key: randomUUID(), asset_ids: [a.id],
  }), 'archived asset linked to new version')
  const c = await upload(contributor, projectA, 'evidence-c.pdf')
  const v2 = ok(await contributor.rpc('submit_deliverable_version', {
    deliverable_id: deliverable, notes: 'Only C', idempotency_key: randomUUID(), asset_ids: [c.id],
  }), 'V2 with C')
  check(v2 !== v1, 'V2 reused V1')
  check((await contributor.from('deliverable_files').select('asset_id').eq('deliverable_version_id', v1)).data?.length === 2,
    'V1 history changed')
  check((await contributor.from('deliverable_files').select('asset_id').eq('deliverable_version_id', v2)).data?.[0]?.asset_id === c.id,
    'V2 asset mismatch')
  console.log('ok - transactional V1 A/B, immutable history, review changes, V2 C')

  const disposable = await upload(contributor, projectA, 'disposable.pdf')
  ok(await pm.rpc('archive_file_asset', { asset_id: disposable.id }), 'archive')
  denied(await contributor.rpc('request_file_permanent_delete', { asset_id: disposable.id }), 'contributor delete allowed')
  ok(await director.rpc('request_file_permanent_delete', { asset_id: disposable.id }), 'director delete request')
  ok(await director.storage.from('project-files').remove([disposable.object_path]), 'physical remove')
  ok(await director.rpc('confirm_file_permanent_delete', { asset_id: disposable.id }), 'delete confirmation')
  check((await director.from('file_assets').select('id').eq('id', disposable.id)).data?.length === 0,
    'deleted asset still visible in manager')
  const audited = ok(await director.from('audit_events').select('event_type').eq('resource_id', disposable.id), 'file audit events')
  check(['file.upload.finalized', 'file.archived', 'file.delete.requested', 'file.deleted_permanently']
    .every((eventType) => audited.some((event) => event.event_type === eventType)), 'file lifecycle audit incomplete')
  console.log('ok - archive, Director-only delete and retained historical links')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
