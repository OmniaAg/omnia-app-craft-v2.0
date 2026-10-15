import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CrmEmpty, CrmError, CrmSuccess } from '../crm/ui/CrmUi'
import { connectionOptionsQuery, historyQuery, invokePhase13, phase13Keys, runDetailQuery, saveAutomation } from './api'
import { automationSchema, type Automation } from './model'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { AutomationForm } from './AutomationForm'
import { HistoryPager, Phase13Page, ProjectSelect, RunStatus, RunTiming, Timestamp } from './ui'
import { usePhase13Project } from './usePhase13Project'

function WorkflowProject({ actor, project, canManage, canRun }: { actor: string; project: string; canManage: boolean; canRun: boolean }) {
  const cache = useQueryClient()
  const [page, setPage] = useState(0)
  const [runPage, setRunPage] = useState(0)
  const [form, setForm] = useState<Automation | 'new' | null>(null)
  const [savedNewId,setSavedNewId]=useState<string>()
  const [runId, setRunId] = useState('')
  const [success, setSuccess] = useState('')
  const definitions = useQuery(historyQuery(actor, project, 'automations', page))
  const runs = useQuery(historyQuery(actor, project, 'runs', runPage))
  const detail = useQuery(runDetailQuery(actor, runId))
  const connections = useQuery({ ...connectionOptionsQuery(actor, project), enabled: Boolean(form) })
  const refresh = () => cache.invalidateQueries({ queryKey: phase13Keys.all })
  const save = useMutation({ mutationFn: (value: Parameters<typeof saveAutomation>[1]) => saveAutomation(project, value, form && form !== 'new' ? form.id : savedNewId),
    onSuccess: async (id) => { setSavedNewId(id);setSuccess('Workflow guardado. Puedes cerrar el editor o seguir trabajando.'); await refresh() } })
  const toggle = useMutation({ mutationFn: (automation: Automation) => saveAutomation(project, { ...automation, enabled: !automation.enabled }, automation.id), onSuccess: refresh })
  const execute = useMutation({ mutationFn: (automation: Automation) => invokePhase13({ operation: 'runAutomation', automationId: automation.id, key: crypto.randomUUID() }),
    onSuccess: async result => { setRunId(result.id); setSuccess('Ejecución registrada. Consulta su estado y sus pasos.'); await refresh() } })
  const retry = useMutation({ mutationFn: (id: string) => invokePhase13({ operation: 'retryAutomation', runId: id }), onSuccess: refresh })
  const error = definitions.error ?? runs.error ?? detail.error ?? save.error ?? toggle.error ?? execute.error ?? retry.error ?? connections.error
  return <>
    <div className="p13-toolbar">{canManage ? <button className="crm-button" onClick={() => { setSavedNewId(undefined);setForm('new'); setSuccess('') }}>Nuevo workflow</button> : null}<button onClick={() => void refresh()}>Actualizar historial</button></div>
    {error ? <CrmError message={error.message} /> : null}{success ? <CrmSuccess message={success} /> : null}
    {form ? <AutomationForm key={form === 'new' ? 'new' : `${form.id}-${form.revision}`} projectId={project} initial={form === 'new' ? undefined : form}
      connections={connections.data ?? []} pending={save.isPending} onSave={async value => {
        const id=await save.mutateAsync(value)
        const {data,error}=await getSupabaseClient().from('automation_definitions').select('*').eq('id',id).single()
        if(error)throw error
        return automationSchema.parse(data)
      }} onCommitted={setForm} onCancel={() => setForm(null)} /> : null}
    <div className="p13-card"><h2>Workflows del proyecto</h2>
      {definitions.isPending ? <p role="status">Cargando workflows…</p> : null}
      {!definitions.isPending && !definitions.data?.items.length ? <CrmEmpty title="Aún no hay workflows" description="Configura un evento y sus acciones para comenzar." /> : null}
      <ul className="p13-history">{definitions.data?.items.map(automation => <li key={automation.id}><h3>{automation.name}</h3><p>{automation.trigger_type === 'manual' ? 'Disparador manual' : automation.event_type} · {automation.actions.length} acciones · Versión {automation.revision}</p>
        <RunStatus status={automation.enabled ? 'active' : 'disabled'} /><div className="p13-actions">
          {canManage ? <><button onClick={() => setForm(automation)}>Configurar {automation.name}</button><button disabled={toggle.isPending} onClick={() => toggle.mutate(automation)}>{automation.enabled ? 'Deshabilitar' : 'Habilitar'} {automation.name}</button></> : null}
          {canRun ? <button disabled={!automation.enabled || execute.isPending} onClick={() => execute.mutate(automation)}>Ejecutar {automation.name}</button> : null}
        </div></li>)}</ul><HistoryPager page={page} total={definitions.data?.total ?? 0} onPage={setPage} />
    </div>
    <div className="p13-card"><h2>Historial de ejecuciones</h2><p>Los eventos se procesan una vez por workflow. Los reintentos conservan los pasos completados.</p>
      {runs.isPending ? <p role="status">Cargando ejecuciones…</p> : null}
      {!runs.isPending && !runs.data?.items.length ? <p>No hay ejecuciones registradas.</p> : null}
      <ul className="p13-history">{runs.data?.items.map(run => <li key={run.id}><RunStatus status={run.status} error={run.safe_error} />
        <div className="p13-meta"><Timestamp value={run.created_at} /><span>Intento {run.attempt} / {run.max_attempt}</span><span>Versión {run.revision}</span><span>Profundidad {run.depth}</span></div>
        <RunTiming started={run.started_at} finished={run.finished_at} /><p>Correlación: {run.correlation_id}</p><div className="p13-actions"><button onClick={() => setRunId(run.id)}>Ver pasos {run.id.slice(0, 8)}</button>
          {canRun && run.status === 'failed' && run.manual_retries < 3 ? <button disabled={retry.isPending} onClick={() => retry.mutate(run.id)}>Reintentar {run.id.slice(0, 8)}</button> : null}
        </div></li>)}</ul><HistoryPager page={runPage} total={runs.data?.total ?? 0} onPage={setRunPage} />
    </div>
    {runId ? <div className="p13-card"><h2>Pasos de la ejecución</h2>{detail.isPending ? <p role="status">Cargando pasos…</p> : null}
      <ol>{detail.data?.steps.map(step => <li key={step.id}><p>{step.position + 1} · {step.action} · Intento {step.attempt}</p><RunStatus status={step.status} error={step.safe_error} /><p>{step.attempts.length} registros de intento</p></li>)}</ol><button onClick={() => setRunId('')}>Cerrar detalle</button></div> : null}
  </>
}
export function Component() {
  const scope = usePhase13Project('automation.view')
  return <Phase13Page title="Automatizaciones" description="Workflows aprobados por proyecto, con acciones ordenadas e historial verificable." error={scope.options.error}>
    <div className="p13-toolbar"><ProjectSelect scope={scope} /></div>
    {scope.selected ? <WorkflowProject key={scope.project} actor={scope.actor} project={scope.project} canManage={scope.selected.can_manage} canRun={scope.selected.can_run} />
      : <p role="status">{scope.options.isPending ? 'Cargando proyectos…' : 'No tienes un proyecto autorizado para automatizaciones.'}</p>}
  </Phase13Page>
}
