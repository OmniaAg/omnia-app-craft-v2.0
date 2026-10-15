import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useAuth } from '../../auth/context/AuthContext'
import { CrmEmpty, CrmError, CrmPageHeader, CrmSuccess, StatusBadge } from '../../crm/ui/CrmUi'
import { dashboardKeys } from '../../dashboard/api/queries'
import { mySpaceKeys } from '../../my-space/api/queries'
import { workKeys } from '../../work/api/queries'
import { acceptApplication, createCycle, createItem, createTemplate, itemCommand, updateCycle, updateItem, updateTemplate, type CycleRow, type EditorialRow, type TemplateRow } from '../api/editorial-service'
import { editorialApplicationsQuery, editorialCyclesQuery, editorialKeys, editorialProjectsQuery, editorialTemplatesQuery, editorialWindowQuery } from '../api/queries'
import { monthWindow, shiftMonth, weekRows } from '../model/dates'
import { useServerDraft } from '../../drafts/useServerDraft'
import { DraftStatus } from '../../drafts/DraftStatus'
import { useDraftSubmission } from '../../drafts/useDraftSubmission'
import { useFlushDrafts } from '../../drafts/draft-context'
import '../../crm/ui/crm.css'
import '../ui/editorial.css'

const channels = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'website', 'other'] as const
const formats = ['post', 'carousel', 'video', 'story', 'article', 'other'] as const
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const labelDate = (date: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

type PieceDraft = { title: string; brief: string; date: string; time: string; channel: string; format: string; cycleId: string; templateId: string }
const blankPiece = (): PieceDraft => ({ title: '', brief: '', date: today, time: '', channel: '', format: '', cycleId: '', templateId: '' })

function Options({ values, empty = 'Seleccionar' }: { values: readonly string[]; empty?: string }) {
  return <><option value="">{empty}</option>{values.map((value) => <option key={value} value={value}>{value === 'other' ? 'Otro' : value}</option>)}</>
}

function TemplateEditor({ initial, projectId, onSave, onCommitted, busy }: { initial?: TemplateRow; projectId: string; onSave: (value: { projectId: string; id?: string; name: string; channel: string; format: string; brief: string }) => Promise<unknown>; onCommitted:()=>void; busy: boolean }) {
  const savedDraft=useServerDraft('editorial',projectId,`template-${initial?.id??'new'}`,{name:initial?.name??'',channel:initial?.default_channel??'',format:initial?.default_format??'',brief:initial?.default_brief??''})
  const {name,channel,format,brief}=savedDraft.value
  const setName=(name:string)=>savedDraft.setValue(current=>({...current,name}))
  const setChannel=(channel:string)=>savedDraft.setValue(current=>({...current,channel}))
  const setFormat=(format:string)=>savedDraft.setValue(current=>({...current,format}))
  const setBrief=(brief:string)=>savedDraft.setValue(current=>({...current,brief}))
  const submission=useDraftSubmission(savedDraft)
  if(!savedDraft.ready)return <DraftStatus draft={savedDraft}/>
  return <form className="crm-form editorial-form" data-server-draft onSubmit={(event) => { event.preventDefault(); void submission.submit(()=>onSave({ projectId, id: initial?.id, name, channel, format, brief }),onCommitted) }}>
    <DraftStatus draft={savedDraft}/>{submission.error?<p role="alert">{submission.error}</p>:null}
    <fieldset className="editorial-form__fields" disabled={busy||submission.pending||submission.committed}>
    <label>Nombre de plantilla<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Canal predeterminado<select value={channel} onChange={(event) => setChannel(event.target.value)}><Options values={channels} empty="Sin predeterminado" /></select></label>
    <label>Formato predeterminado<select value={format} onChange={(event) => setFormat(event.target.value)}><Options values={formats} empty="Sin predeterminado" /></select></label>
    <label className="editorial-form__wide">Instrucciones predeterminadas<textarea rows={3} maxLength={12000} value={brief} onChange={(event) => setBrief(event.target.value)} /></label>
    </fieldset>
    <button className="crm-button crm-button--primary" disabled={busy||submission.pending} type="submit">{busy||submission.pending ? 'Guardando…' : submission.committed?'Finalizar guardado':'Guardar plantilla'}</button>
  </form>
}

function CycleEditor({ initial, projectId, onSave, onCommitted, busy }: { initial?: CycleRow; projectId: string; onSave: (value: { projectId: string; id?: string; name: string; from: string; to: string; status: string }) => Promise<unknown>; onCommitted:()=>void; busy: boolean }) {
  const savedDraft=useServerDraft('editorial',projectId,`cycle-${initial?.id??'new'}`,{name:initial?.name??'',from:initial?.start_date??today,to:initial?.end_date??today,status:initial?.status??'open'})
  const {name,from,to,status}=savedDraft.value
  const setName=(name:string)=>savedDraft.setValue(current=>({...current,name}))
  const setFrom=(from:string)=>savedDraft.setValue(current=>({...current,from}))
  const setTo=(to:string)=>savedDraft.setValue(current=>({...current,to}))
  const setStatus=(status:string)=>savedDraft.setValue(current=>({...current,status}))
  const submission=useDraftSubmission(savedDraft)
  if(!savedDraft.ready)return <DraftStatus draft={savedDraft}/>
  return <form className="crm-form editorial-form" data-server-draft onSubmit={(event) => { event.preventDefault(); void submission.submit(()=>onSave({ projectId, id: initial?.id, name, from, to, status }),onCommitted) }}>
    <DraftStatus draft={savedDraft}/>{submission.error?<p role="alert">{submission.error}</p>:null}
    <fieldset className="editorial-form__fields" disabled={busy||submission.pending||submission.committed}>
    <label>Nombre del ciclo<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Inicio<input required type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
    <label>Fin<input required type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></label>
    {initial ? <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Abierto</option><option value="closed">Cerrado</option><option value="archived">Archivar</option></select></label> : null}
    </fieldset>
    <button className="crm-button crm-button--primary" disabled={busy||submission.pending} type="submit">{busy||submission.pending ? 'Guardando…' : submission.committed?'Finalizar guardado':'Guardar ciclo'}</button>
  </form>
}

function PieceEditor({ initial, cycles, templates, projectId, onSave, onCommitted, busy }: { initial?: EditorialRow; cycles: CycleRow[]; templates: TemplateRow[]; projectId: string; onSave: (value: PieceDraft & { id?: string; projectId: string }) => Promise<unknown>; onCommitted:()=>void; busy: boolean }) {
  const savedDraft = useServerDraft<PieceDraft>('editorial',projectId,initial?.item_id ?? 'new-piece',initial ? { title: initial.title, brief: initial.brief ?? '', date: initial.scheduled_date, time: initial.scheduled_time?.slice(0, 5) ?? '', channel: initial.channel, format: initial.format, cycleId: initial.cycle_id, templateId: initial.template_id ?? '' } : blankPiece())
  const {value:draft,setValue:setDraft} = savedDraft
  const set = (key: keyof PieceDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const template = templates.find((entry) => entry.id === draft.templateId)
  const cycle = cycles.find((entry) => entry.id === draft.cycleId)
  const submission=useDraftSubmission(savedDraft)
  if(!savedDraft.ready)return <DraftStatus draft={savedDraft}/>
  return <form className="crm-form editorial-form" data-server-draft onSubmit={(event) => { event.preventDefault(); void submission.submit(()=>onSave({ ...draft, projectId, id: initial?.item_id }),onCommitted) }}>
    <DraftStatus draft={savedDraft}/>{submission.error?<p role="alert">{submission.error}</p>:null}
    <fieldset className="editorial-form__fields" disabled={busy||submission.pending||submission.committed}>
    {!initial ? <><label>Ciclo<select required value={draft.cycleId} onChange={(event) => set('cycleId', event.target.value)}><option value="">Seleccionar ciclo</option>{cycles.filter((entry) => entry.status === 'open').map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.start_date} – {entry.end_date}</option>)}</select></label>
      <label>Usar plantilla<select value={draft.templateId} onChange={(event) => { const next = templates.find((entry) => entry.id === event.target.value); setDraft((current) => ({ ...current, templateId: next?.id ?? '', channel: next?.default_channel ?? current.channel, format: next?.default_format ?? current.format, brief: next?.default_brief ?? current.brief })) }}><option value="">Sin plantilla</option>{templates.filter((entry) => !entry.archived_at).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></> : null}
    <label>Título editorial<input required maxLength={240} value={draft.title} onChange={(event) => set('title', event.target.value)} /></label>
    <label>Fecha<input required type="date" min={cycle?.start_date} max={cycle?.end_date} value={draft.date} onChange={(event) => set('date', event.target.value)} /></label>
    <label>Hora local, opcional<input type="time" value={draft.time} onChange={(event) => set('time', event.target.value)} /></label>
    <label>Canal<select required value={draft.channel || template?.default_channel || ''} onChange={(event) => set('channel', event.target.value)}><Options values={channels} /></select></label>
    <label>Formato<select required value={draft.format || template?.default_format || ''} onChange={(event) => set('format', event.target.value)}><Options values={formats} /></select></label>
    <label className="editorial-form__wide">Brief<textarea rows={4} maxLength={12000} value={draft.brief} onChange={(event) => set('brief', event.target.value)} /></label>
    </fieldset>
    <button className="crm-button crm-button--primary" disabled={busy||submission.pending || !savedDraft.ready} type="submit">{busy||submission.pending ? 'Guardando…' : submission.committed?'Finalizar guardado':initial ? 'Guardar pieza' : 'Crear pieza y trabajo'}</button>
  </form>
}

export function Component() {
  const auth = useAuth()
  const flushDrafts=useFlushDrafts()
  const queryClient = useQueryClient()
  const { projectId: routeProjectId } = useParams()
  const [params, setParams] = useSearchParams()
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '') ? params.get('month')! : today.slice(0, 7)
  const view = params.get('view') === 'calendar' ? 'calendar' : 'agenda'
  const projectId = routeProjectId ?? params.get('project') ?? ''
  const state = params.get('state') ?? ''
  const channel = params.get('channel') ?? ''
  const window = monthWindow(month)
  const projects = useQuery(editorialProjectsQuery())
  const cycleQuery = useQuery({ ...editorialCyclesQuery(projectId), enabled: Boolean(projectId) })
  const templateQuery = useQuery({ ...editorialTemplatesQuery(projectId), enabled: Boolean(projectId) })
  const items = useQuery(editorialWindowQuery({ ...window, projectId, state, channel }))
  const [editor, setEditor] = useState<'cycle' | 'template' | 'piece' | null>(null)
  const [editingCycle, setEditingCycle] = useState<CycleRow | undefined>()
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | undefined>()
  const [editingPiece, setEditingPiece] = useState<EditorialRow | undefined>()
  const [selectedItemId, setSelectedItemId] = useState('')
  const selected = items.data?.find((item) => item.item_id === selectedItemId)
  const applicants = useQuery({ ...editorialApplicationsQuery(selectedItemId), enabled: Boolean(selectedItemId && selected?.can_manage && auth.hasCapability('editorial.assign')) })
  const [notice, setNotice] = useState('')
  const canPlan = auth.hasCapability('editorial.plan') && Boolean(projectId)
  const canCreate = auth.hasCapability('editorial.create') && Boolean(projectId)
  const canPublish = auth.hasCapability('editorial.publish_available')
  const canAssign = auth.hasCapability('editorial.assign')

  const invalidate = async (kind: 'general' | 'assignment' = 'general') => {
    await queryClient.invalidateQueries({ queryKey: editorialKeys.all })
    if (kind === 'assignment') {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mySpaceKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.operational() }),
        queryClient.invalidateQueries({ queryKey: workKeys.all }),
      ])
    }
  }
  const command = useMutation({ mutationFn: ({ action, id }: { action: 'publish' | 'apply' | 'archive'; id: string }) => itemCommand(getSupabaseClient(), action, id), onSuccess: async (_, variables) => { setNotice(variables.action === 'apply' ? 'Postulación registrada.' : variables.action === 'publish' ? 'La pieza está disponible internamente.' : 'Pieza archivada.'); await invalidate() } })
  const accept = useMutation({ mutationFn: (id: string) => acceptApplication(getSupabaseClient(), id), onSuccess: async () => { setNotice('Postulación aceptada y trabajo asignado.'); await invalidate('assignment') } })
  const saveTemplate = useMutation({ mutationFn: (value: { projectId: string; id?: string; name: string; channel: string; format: string; brief: string; archive?: boolean }) => value.id ? updateTemplate(getSupabaseClient(), { ...value, id: value.id }) : createTemplate(getSupabaseClient(), value), onSuccess: async () => { setNotice('Plantilla guardada.'); await invalidate() } })
  const saveCycle = useMutation({ mutationFn: (value: { projectId: string; id?: string; name: string; from: string; to: string; status: string }) => value.id ? updateCycle(getSupabaseClient(), { ...value, id: value.id }) : createCycle(getSupabaseClient(), value), onSuccess: async () => { setNotice('Ciclo guardado.'); await invalidate() } })
  const savePiece = useMutation({ mutationFn: (value: PieceDraft & { id?: string; projectId: string }) => value.id ? updateItem(getSupabaseClient(), { ...value, id: value.id }) : createItem(getSupabaseClient(), value), onSuccess: async () => { setNotice('Pieza y trabajo guardados.'); await invalidate() } })

  const changeParam = (name: string, value: string) => setParams((current) => { if (value) current.set(name, value); else current.delete(name); return current })
  const startEdit = async (kind: 'cycle' | 'template' | 'piece', value?: CycleRow | TemplateRow | EditorialRow) => {
    if(!await flushDrafts())return
    setEditor(kind)
    setEditingCycle(kind === 'cycle' ? value as CycleRow | undefined : undefined)
    setEditingTemplate(kind === 'template' ? value as TemplateRow | undefined : undefined)
    setEditingPiece(kind === 'piece' ? value as EditorialRow | undefined : undefined)
    setNotice('')
  }
  const row = (item: EditorialRow) => <li key={item.item_id} className="editorial-entry">
    <div className="editorial-entry__main"><time dateTime={item.scheduled_date}>{labelDate(item.scheduled_date)}{item.scheduled_time ? ` · ${item.scheduled_time.slice(0, 5)}` : ''}</time><h3>{item.title}</h3><p>{item.brand_name} / {item.project_name} · {item.channel} · {item.format}</p><div className="editorial-entry__badges"><StatusBadge value={item.planning_state} />{item.assignee_names.length ? <span>Responsable: {item.assignee_names.join(', ')}</span> : null}{item.own_application_status ? <span>Mi postulación: {item.own_application_status}</span> : null}</div></div>
    <div className="editorial-entry__actions"><button className="crm-button" type="button" aria-expanded={selectedItemId === item.item_id} onClick={() => setSelectedItemId(selectedItemId === item.item_id ? '' : item.item_id)}>Detalle</button>{item.can_manage || item.own_application_status === 'accepted' ? <Link className="crm-row-link" to={`/app/projects/${item.project_id}?tab=work&workItem=${item.work_item_id}`}>Trabajo</Link> : null}</div>
  </li>

  const submitNoop = (event: FormEvent) => event.preventDefault()
  return <section className="crm-page editorial-page">
    <CrmPageHeader title="Editorial" description="Planifica por fecha y proyecto. “Disponible” invita postulaciones internas; no publica en redes." action={projectId && <Link className="crm-row-link" to={`/app/projects/${projectId}`}>Volver al proyecto</Link>} />
    <div className="editorial-toolbar"><div className="editorial-month"><button className="crm-button" type="button" aria-label="Mes anterior" onClick={() => changeParam('month', shiftMonth(month, -1))}>←</button><strong>{new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))}</strong><button className="crm-button" type="button" aria-label="Mes siguiente" onClick={() => changeParam('month', shiftMonth(month, 1))}>→</button></div><div className="editorial-view-switch" role="group" aria-label="Vista editorial"><button type="button" aria-pressed={view === 'agenda'} onClick={() => changeParam('view', 'agenda')}>Agenda</button><button type="button" aria-pressed={view === 'calendar'} onClick={() => changeParam('view', 'calendar')}>Calendario</button></div></div>
    <form className="crm-filters" onSubmit={submitNoop} aria-label="Filtros editoriales"><label>Proyecto<select value={projectId} disabled={Boolean(routeProjectId)} onChange={(event) => changeParam('project', event.target.value)}><option value="">Todos los autorizados</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Estado<select value={state} onChange={(event) => changeParam('state', event.target.value)}><option value="">Todos</option><option value="planned">Planificado</option><option value="available">Disponible</option><option value="assigned">Asignado</option></select></label><label>Canal<select value={channel} onChange={(event) => changeParam('channel', event.target.value)}><Options values={channels} empty="Todos" /></select></label></form>
    {projects.error ? <CrmError message={projects.error.message} /> : null}{items.error ? <CrmError message={items.error.message} /> : null}
    {notice ? <CrmSuccess message={notice} /> : null}
    {[command, accept, saveTemplate, saveCycle, savePiece].map((mutation, index) => mutation.error ? <CrmError key={index} message={mutation.error.message} /> : null)}
    {projectId && (canPlan || canCreate) ? <div className="editorial-actions">{canPlan ? <><button className="crm-button" type="button" onClick={() => startEdit('cycle')}>Nuevo ciclo</button><button className="crm-button" type="button" onClick={() => startEdit('template')}>Nueva plantilla</button></> : null}{canCreate ? <button className="crm-button crm-button--primary" type="button" onClick={() => startEdit('piece')}>Nueva pieza</button> : null}</div> : null}
    {projectId && canPlan ? <div className="editorial-library"><section><h2>Ciclos</h2>{cycleQuery.isPending ? <p role="status">Cargando ciclos…</p> : null}{cycleQuery.error ? <CrmError message={cycleQuery.error.message} /> : null}<ul>{cycleQuery.data?.map((cycle) => <li key={cycle.id}><span>{cycle.name} · {labelDate(cycle.start_date)} – {labelDate(cycle.end_date)} · {cycle.status}</span>{cycle.status !== 'archived' ? <button className="crm-button" type="button" onClick={() => startEdit('cycle', cycle)}>Editar</button> : null}</li>)}</ul></section><section><h2>Plantillas</h2>{templateQuery.isPending ? <p role="status">Cargando plantillas…</p> : null}{templateQuery.error ? <CrmError message={templateQuery.error.message} /> : null}<ul>{templateQuery.data?.map((template) => <li key={template.id}><span>{template.name}{template.archived_at ? ' · archivada' : ''}</span>{!template.archived_at ? <div><button className="crm-button" type="button" onClick={() => startEdit('template', template)}>Editar</button><button className="crm-button" type="button" disabled={saveTemplate.isPending} onClick={() => void saveTemplate.mutateAsync({ id: template.id, projectId, name: template.name, channel: template.default_channel ?? '', format: template.default_format ?? '', brief: template.default_brief ?? '', archive: true })}>Archivar</button></div> : null}</li>)}</ul></section></div> : null}
    {editor && projectId ? <section className="crm-editor editorial-editor" aria-labelledby="editorial-editor-title">
      <div className="editorial-editor__heading"><h2 id="editorial-editor-title">{editor === 'cycle' ? editingCycle ? 'Editar ciclo' : 'Nuevo ciclo' : editor === 'template' ? editingTemplate ? 'Editar plantilla' : 'Nueva plantilla' : editingPiece ? 'Editar pieza' : 'Nueva pieza'}</h2><button className="crm-button" type="button" onClick={() => void flushDrafts().then(saved=>{if(saved)setEditor(null)})}>Cerrar</button></div>
      {editor === 'cycle' ? <CycleEditor key={`${projectId}-${editingCycle?.id ?? 'new'}`} initial={editingCycle} projectId={projectId} busy={saveCycle.isPending} onCommitted={()=>setEditor(null)} onSave={(value) => saveCycle.mutateAsync(value)} />
        : editor === 'template' ? <TemplateEditor key={`${projectId}-${editingTemplate?.id ?? 'new'}`} initial={editingTemplate} projectId={projectId} busy={saveTemplate.isPending} onCommitted={()=>setEditor(null)} onSave={(value) => saveTemplate.mutateAsync(value)} />
        : <PieceEditor key={`${projectId}-${editingPiece?.item_id ?? 'new'}`} initial={editingPiece} projectId={projectId} cycles={cycleQuery.data ?? []} templates={templateQuery.data ?? []} busy={savePiece.isPending} onCommitted={()=>setEditor(null)} onSave={(value) => savePiece.mutateAsync(value)} />}
    </section> : null}
    {items.isPending ? <p role="status">Cargando agenda editorial…</p> : null}
    {!items.isPending && items.data?.length === 0 ? <CrmEmpty title="Sin piezas en este periodo" description="Cambia el mes o los filtros. Los ciclos pueden abarcar cualquier duración." /> : null}
    {view === 'calendar' && !items.isPending ? <><p className="editorial-mobile-note">En pantalla pequeña se muestra la agenda para facilitar la lectura.</p><div className="editorial-calendar" role="table" aria-label={`Calendario editorial de ${month}`}><div className="editorial-weekdays" role="row">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day) => <span role="columnheader" key={day}>{day}</span>)}</div>{weekRows(month).map((week) => <div className="editorial-week" role="row" key={week[0]}>{week.map((date) => <div className="editorial-day" role="cell" data-outside={date.slice(0, 7) !== month} key={date}><time dateTime={date}>{Number(date.slice(-2))}</time>{items.data?.filter((item) => item.scheduled_date === date).map((item) => <button type="button" key={item.item_id} onClick={() => setSelectedItemId(item.item_id)}><strong>{item.title}</strong><span>{item.project_name} · {item.channel}</span></button>)}</div>)}</div>)}</div></> : null}
    <section aria-label="Agenda editorial" className={view === 'calendar' ? 'editorial-agenda editorial-agenda--alternate' : 'editorial-agenda'}><h2>{view === 'calendar' ? 'Agenda accesible' : 'Agenda'}</h2><ol>{items.data?.map(row)}</ol></section>
    {selected ? <section className="crm-editor editorial-detail" aria-labelledby="editorial-detail-title"><div className="editorial-editor__heading"><h2 id="editorial-detail-title">{selected.title}</h2><button className="crm-button" type="button" onClick={() => setSelectedItemId('')}>Cerrar</button></div><p>{labelDate(selected.scheduled_date)} · {selected.brand_name} / {selected.project_name} · {selected.channel} · {selected.format}</p>{selected.brief ? <p>{selected.brief}</p> : null}<p>Planificación: <StatusBadge value={selected.planning_state} /></p><div className="editorial-actions">{selected.can_manage && selected.planning_state !== 'assigned' ? <button className="crm-button" type="button" onClick={() => startEdit('piece', selected)}>Editar</button> : null}{selected.planning_state === 'planned' && canPublish ? <button className="crm-button crm-button--primary" type="button" disabled={command.isPending} onClick={() => command.mutate({ action: 'publish', id: selected.item_id })}>Publicar como disponible</button> : null}{selected.can_apply && !selected.own_application_status ? <button className="crm-button crm-button--primary" type="button" disabled={command.isPending} onClick={() => command.mutate({ action: 'apply', id: selected.item_id })}>Postularme</button> : null}{selected.can_manage && auth.hasCapability('editorial.archive') ? <button className="crm-button" type="button" disabled={command.isPending} onClick={() => command.mutate({ action: 'archive', id: selected.item_id })}>Archivar pieza</button> : null}</div>{canAssign && selected.can_manage ? <section className="editorial-applicants" aria-label="Postulantes"><h3>Postulantes</h3>{applicants.isPending ? <p role="status">Cargando postulaciones…</p> : null}{applicants.error ? <CrmError message={applicants.error.message} /> : null}<ul>{applicants.data?.map((application) => <li key={application.application_id}><span>{application.applicant_name} · {application.status}</span>{application.status === 'pending' && selected.planning_state === 'available' ? <button className="crm-button" type="button" disabled={accept.isPending} onClick={() => accept.mutate(application.application_id)}>Aceptar</button> : null}</li>)}</ul>{applicants.data?.length === 0 ? <p>Sin postulaciones todavía.</p> : null}</section> : null}</section> : null}
  </section>
}

