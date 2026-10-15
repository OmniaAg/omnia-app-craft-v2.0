import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/context/AuthContext'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { CrmError, CrmSuccess } from '../crm/ui/CrmUi'
import { aiConsentQuery, approveDraft, historyQuery, invokePhase13, phase13Keys, setAIConsent } from '../automations/api'
import type { AIRun } from '../automations/model'
import { HistoryPager, Phase13Page, RunStatus, RunTiming } from '../automations/ui'

function AIResult({ run, canApprove, onApprove, pending }: { run: AIRun; canApprove: boolean; onApprove: () => void; pending: boolean }) {
  const [reviewed, setReviewed] = useState(false)
  const { projectId = '' } = useParams()
  if (!run.result) return null
  return <div><p><strong>Generado por IA · Proveedor local determinista</strong></p><p>Modelo {run.model} · Plantilla v{run.template_version} · {run.context_counts.work_items} trabajos de contexto</p>
    {'summary' in run.result ? <p>{run.result.summary}</p> : <><h3>{run.result.title}</h3><p className="p13-result">{run.result.description}</p><p>Prioridad propuesta: {run.result.priority}</p>
      {run.approved_work_item_id ? <Link to={`/app/projects/${projectId}?tab=work&workItem=${run.approved_work_item_id}`}>Ver trabajo aprobado</Link>
        : canApprove ? <><label className="p13-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />He revisado el borrador y autorizo crear este trabajo</label><button disabled={!reviewed || pending} onClick={onApprove}>Aprobar y crear trabajo</button></> : <p>Este borrador requiere una persona con permiso para crear trabajo.</p>}
    </>}
  </div>
}
export function Component() {
  const { projectId = '' } = useParams()
  const auth = useAuth()
  const actor = auth.actor?.user.id ?? ''
  const cache = useQueryClient()
  const [page, setPage] = useState(0)
  const [success, setSuccess] = useState('')
  const access = useQuery({ queryKey: ['phase13', actor, projectId, 'ai-access'],
    queryFn: async () => {
      const [use, manage, create] = await Promise.all([
        getSupabaseClient().rpc('phase13_access', { p_project: projectId, p_capability: 'ai.use' }),
        getSupabaseClient().rpc('phase13_access', { p_project: projectId, p_capability: 'ai.manage' }),
        getSupabaseClient().rpc('project_access_allowed', { project_id: projectId, capability_key: 'work.create' }),
      ])
      if (use.error || manage.error || create.error) throw new Error('No pudimos consultar tus permisos.')
      return { use: Boolean(use.data), manage: Boolean(manage.data), create: Boolean(create.data) }
    },
  })
  const consent = useQuery({ ...aiConsentQuery(actor, projectId), enabled: access.data?.use === true })
  const history = useQuery({ ...historyQuery(actor, projectId, 'ai', page), enabled: access.data?.use === true })
  const refresh = () => cache.invalidateQueries({ queryKey: phase13Keys.all })
  const enable = useMutation({ mutationFn: () => setAIConsent(projectId, !consent.data), onSuccess: refresh })
  const generate = useMutation({ mutationFn: (values: { task: string; input: string }) => invokePhase13({ operation: 'generateAI', projectId, ...values, key: crypto.randomUUID(), consent: true }),
    onSuccess: async () => { setSuccess('Resultado registrado. Revísalo antes de usarlo.'); await refresh() } })
  const approve = useMutation({ mutationFn: approveDraft, onSuccess: async () => { setSuccess('Borrador aprobado y trabajo creado.'); await refresh(); await cache.invalidateQueries({ queryKey: ['work'] }) } })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const form=event.currentTarget
    generate.mutate({ task: String(values.get('task')), input: String(values.get('input')) },{onSuccess:()=>form.dispatchEvent(new Event('omnia:form-saved',{bubbles:true}))})
  }
  const error = access.error ?? consent.error ?? history.error ?? generate.error ?? enable.error ?? approve.error
  return <Phase13Page title="Asistente del proyecto" description="Resumen y borradores con contexto mínimo de tu alcance. Revisa los resultados antes de actuar." error={error}>
    <Link className="crm-back-link" to={`/app/projects/${projectId}`}>← Volver al proyecto</Link>
    {access.isPending ? <p role="status">Consultando acceso…</p> : null}
    {access.data?.use ? <>
      {success ? <CrmSuccess message={success} /> : null}
      <div className="p13-card"><h2>Asistencia autorizada</h2><p>{consent.data ? 'Habilitada para este proyecto.' : 'Dirección debe habilitar la asistencia para este proyecto.'} El proveedor local genera respuestas deterministas sin enviar contexto a servicios externos.</p>
        {access.data.manage ? <button disabled={enable.isPending || consent.isPending} onClick={() => enable.mutate()}>{consent.data ? 'Revocar consentimiento de IA' : 'Habilitar asistencia de IA'}</button> : null}
      </div>
      {consent.data ? <form onSubmit={submit} className="p13-card p13-form"><fieldset className="form-fields" disabled={generate.isPending}><h2>Nueva solicitud</h2><label className="p13-field">Tarea<select name="task"><option value="project_summary">Resumir proyecto</option><option value="draft_work">Proponer borrador de trabajo</option></select></label>
        <label className="p13-field">Indicaciones para el borrador (opcional)<textarea name="input" rows={4} maxLength={2000} /><small>Hasta 2,000 caracteres. El texto se trata como datos y no concede permisos.</small></label>
        <label className="p13-check"><input type="checkbox" required />Autorizo esta solicitud con contexto de este proyecto</label><button className="crm-button" disabled={generate.isPending}>{generate.isPending ? 'Generando…' : 'Generar resultado'}</button>
      </fieldset></form> : null}
      <div className="p13-card"><div className="p13-toolbar"><h2>Mis resultados</h2><button onClick={() => void refresh()}>Actualizar resultados</button></div>
        {history.isPending ? <p role="status">Cargando resultados…</p> : null}{!history.isPending && !history.data?.items.length ? <p>Aún no hay solicitudes.</p> : null}
        <ul className="p13-history">{history.data?.items.map(run => <li key={run.id}><RunStatus status={run.status} error={run.safe_error} /><RunTiming started={run.started_at} finished={run.finished_at} />
          <AIResult run={run} canApprove={access.data.create} pending={approve.isPending} onApprove={() => approve.mutate(run.id)} /></li>)}</ul><HistoryPager page={page} total={history.data?.total ?? 0} onPage={setPage} />
      </div>
    </> : access.data ? <CrmError message="No tienes permiso para usar IA en este proyecto." /> : null}
  </Phase13Page>
}
