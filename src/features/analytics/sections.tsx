import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context/AuthContext'
import { analyticsQueries, createReport, publishReport } from './api'
import { labels, type Filters } from './model'
import { Distribution, Metrics, Pager, QueryState, Table } from './ui'
import { duration, money, stamp } from './format'

type Props = { actor: string; filters: Filters }
export function Overview({ actor, filters, onDetails }: Props & { onDetails: (filter: string) => void }) {
  const query = useQuery(analyticsQueries.overview(actor, filters))
  const d = query.data
  return <QueryState loading={query.isPending} error={query.error}>{d ? <>
    <h2>Estado actual de tu alcance</h2><Metrics values={[
      ['Clientes activos', d.active_clients], ['Proyectos activos', d.active_projects],
      ['Trabajo abierto', <button key="open" onClick={() => onDetails('open')}>{d.open_work} · Ver detalle</button>],
      ['Trabajo vencido', <button key="overdue" onClick={() => onDetails('overdue')}>{d.overdue_work} · Ver detalle</button>],
      ['Trabajo bloqueado', <button key="blocked" onClick={() => onDetails('blocked')}>{d.blocked_work} · Ver detalle</button>],
      ['Pendiente de revisión interna', d.pending_internal], ['Pendiente de decisión cliente', d.pending_client],
    ]} /><h2>Completados durante el periodo</h2><Metrics values={[
      ['Periodo elegido', d.completed_period], ['Periodo anterior equivalente', d.completed_previous],
      ['Diferencia descriptiva', d.completed_period - d.completed_previous],
    ]} /><p>Completados = trabajo actualmente terminado cuya fecha de finalización cae en el periodo. La comparación usa el mismo número de días.</p>
    <p>Consultado: {stamp(d.as_of)} · America/Mexico_City</p>
  </> : null}</QueryState>
}
export function Projects({ actor, filters }: Props) {
  const [page, setPage] = useState(0)
  const q = useQuery(analyticsQueries.projects(actor, filters, page))
  return <QueryState loading={q.isPending} error={q.error}>{q.data ? <>
    <Distribution title="Estado actual de los proyectos" values={q.data.statuses} />
    <Table caption="Progreso por proyecto" headers={['Proyecto', 'Hitos completos / pendientes', 'Trabajo abierto / vencido / bloqueado', 'Completados en periodo', 'Actividad en periodo']}>
      {q.data.items.map(p => <tr key={p.project_id}><td><Link to={`/app/projects/${p.project_id}`}>{p.project_name}</Link><br />{p.organization_name} · {p.brand_name}<br />{labels[p.project_status]}</td>
        <td>{p.milestones_done} / {p.milestones_pending}</td><td>{p.open_work} / {p.overdue_work} / {p.blocked_work}</td>
        <td>{p.completed_period}</td><td>{p.activity_period} eventos de trabajo<br />{stamp(p.last_activity)}</td></tr>)}
    </Table>{q.data.total === 0 ? <p>No hay proyectos en este alcance.</p> : null}<Pager page={page} total={q.data.total} onPage={setPage} />
  </> : null}</QueryState>
}
export function Work({ actor, filters, initialFilter }: Props & { initialFilter: string }) {
  const [filter, setFilter] = useState(initialFilter)
  const [page, setPage] = useState(0)
  const q = useQuery(analyticsQueries.work(actor, filters))
  const details = useQuery(analyticsQueries.workDetails(actor, filters, filter, page))
  return <><QueryState loading={q.isPending} error={q.error}>{q.data ? <>
    <Metrics values={[
      ['Completados en periodo', q.data.completed_period], ['Mediana creación → finalización', duration(q.data.median_completion_days, 'días')],
      ['Antigüedad mediana de abiertos', duration(q.data.median_open_age_days, 'días')],
    ]} /><div className="analytics-columns"><Distribution title="Estado actual" values={q.data.statuses} />
      <Distribution title="Prioridad del trabajo abierto" values={q.data.priorities} /></div>
    <Distribution title={`Completados por ${labels[q.data.bucket]}`} values={Object.fromEntries(q.data.series.map(s => [s.day, s.count]))} />
    {q.data.completed_period === 0 ? <p>No hay finalizaciones para este periodo.</p> : null}
  </> : null}</QueryState>
    <label>Detalle de trabajo <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0) }}>
      <option value="overdue">Vencido ahora</option><option value="open">Abierto ahora</option><option value="blocked">Bloqueado ahora</option><option value="completed">Completado en periodo</option>
    </select></label><QueryState loading={details.isPending} error={details.error}>{details.data ? <>
      <Table caption="Trabajo autorizado" headers={['Trabajo', 'Proyecto', 'Estado', 'Prioridad', 'Vencimiento']}>
        {details.data.items.map(w => <tr key={w.id}><td>{w.title}</td><td><Link to={`/app/projects/${w.project_id}`}>{w.project_name}</Link></td>
          <td>{labels[w.status]}</td><td>{labels[w.priority]}</td><td>{w.due_at ? stamp(w.due_at) : 'Sin fecha'}</td></tr>)}
      </Table>{!details.data.total ? <p>No hay trabajo con este filtro.</p> : null}<Pager page={page} total={details.data.total} onPage={setPage} />
    </> : null}</QueryState></>
}
export function Editorial({ actor, filters }: Props) {
  const q = useQuery(analyticsQueries.editorial(actor, filters))
  return <QueryState loading={q.isPending} error={q.error}>{q.data ? <>
    <p>Producción programada entre {filters.from} y {filters.to}. Los estados son actuales; las piezas canceladas se muestran aparte y se excluyen de canales y formatos.</p>
    <Distribution title="Planificación editorial" values={q.data.states} /><div className="analytics-columns">
      <Distribution title="Piezas por canal" values={q.data.channels} /><Distribution title="Piezas por formato" values={q.data.formats} /></div>
    <Link to={filters.project ? `/app/projects/${filters.project}/editorial` : '/app/editorial/calendar'}>Abrir calendario editorial</Link>
  </> : null}</QueryState>
}
export function Reviews({ actor, filters }: Props) {
  const q = useQuery(analyticsQueries.reviews(actor, filters))
  return <QueryState loading={q.isPending} error={q.error}>{q.data ? <>
    <Distribution title="Estado actual de las entregas" values={q.data.statuses} />
    <h2>Revisión interna durante el periodo</h2><Metrics values={[
      ['Versiones enviadas', q.data.submitted_period], ['Rondas aprobadas', q.data.internal_approved_period], ['Rondas con cambios', q.data.internal_changes_period],
      ['Rondas pendientes ahora', q.data.pending_internal], ['Mediana apertura → cierre', duration(q.data.median_internal_hours, 'horas')],
    ]} /><h2>Revisión cliente durante el periodo</h2><Metrics values={[
      ['Versiones publicadas', q.data.published_period], ['Revisiones aprobadas', q.data.client_approved_period], ['Revisiones con cambios', q.data.client_changes_period],
      ['Revisiones pendientes ahora', q.data.pending_client], ['Mediana apertura → cierre', duration(q.data.median_client_hours, 'horas')],
    ]} /><p>Mediana de versiones por entrega actual: {duration(q.data.median_versions, 'versiones')}. Describe iteraciones; no evalúa desempeño individual.</p>
    <Link to="/app/reviews">Abrir mis revisiones asignadas</Link>
  </> : null}</QueryState>
}
export function Billing({ actor, filters }: Props) {
  const [page, setPage] = useState(0)
  const q = useQuery(analyticsQueries.billing(actor, filters))
  const details = useQuery(analyticsQueries.billingDetails(actor, filters, page))
  return <><p>Registros operativos de documentos emitidos con fecha entre {filters.from} y {filters.to}. Los pagos y saldos reflejan el estado actual de esos documentos. No son contabilidad.</p>
    <QueryState loading={q.isPending} error={q.error}>{q.data ? <>
      {q.data.currencies.map(c => <section key={c.currency}><h2>{c.currency}</h2><Metrics values={[
        ['Total documentado', money(c.issued_amount, c.currency)], ['Registrado como pagado', money(c.paid_amount, c.currency)],
        ['Saldo pendiente', money(c.remaining_amount, c.currency)], ['Documentos vencidos', c.overdue], ['Vencen en 7 días', c.upcoming_due],
        ['Pago parcial', c.partially_paid], ['Pagados', c.paid],
      ]} /></section>)}{!q.data.currencies.length ? <p>No hay documentos emitidos para este periodo.</p> : null}
    </> : null}</QueryState><QueryState loading={details.isPending} error={details.error}>{details.data ? <>
      <Table caption="Documentos del mismo alcance y periodo" headers={['Documento', 'Estado', 'Fecha / vencimiento', 'Documentado', 'Pagado', 'Pendiente']}>
        {details.data.items.map(d => <tr key={d.id}><td><Link to="/app/billing">{d.number ?? 'Documento emitido'}</Link></td><td>{labels[d.status]}</td>
          <td>{d.document_date} / {d.due_date ?? 'Sin fecha'}</td><td>{money(d.total_amount, d.currency)}</td><td>{money(d.paid_amount, d.currency)}</td><td>{money(d.remaining_amount, d.currency)}</td></tr>)}
      </Table><Pager page={page} total={details.data.total} onPage={setPage} />
    </> : null}</QueryState></>
}
export function Reports({ actor, filters }: Props) {
  const auth = useAuth()
  const [page, setPage] = useState(0)
  const [title, setTitle] = useState('Reporte de avance')
  const cache = useQueryClient()
  const q = useQuery({ ...analyticsQueries.reports(actor, filters.project, page), enabled: !!filters.project })
  const mutation = useMutation({ mutationFn: async (action: { id?: string; publish?: boolean }) => {
    if (action.id) return publishReport(action.id, !!action.publish)
    if (!filters.project) throw new Error('Elige un proyecto para crear el reporte.')
    return createReport(filters.project, title, filters)
  }, onSuccess: () => { void cache.invalidateQueries({ queryKey: ['analytics', actor, 'reports'] }) } })
  return <><p>La creación conserva título y periodo. Publicar habilita al cliente la consulta actual de hitos y recursos publicados. El reporte es dinámico y no constituye una captura histórica.</p>
    {auth.hasCapability('report.publish') ? <form className="analytics-filters" onSubmit={e => { e.preventDefault(); mutation.mutate({}) }}>
      <label>Título del reporte<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required /></label>
      <button disabled={!filters.project || mutation.isPending}>Crear borrador</button>{!filters.project ? <p>Selecciona un proyecto en los filtros.</p> : null}
    </form> : null}{mutation.error ? <p role="alert">No se pudo guardar el reporte. Comprueba el proyecto y tus permisos.</p> : null}
    {mutation.isSuccess ? <p role="status">Reporte guardado.</p> : null}
    {!filters.project ? <p>Selecciona un proyecto para consultar sus reportes.</p> : <QueryState loading={q.isPending} error={q.error}>{q.data ? <><ul className="analytics-report-list">{q.data.items.map(r => <li key={r.id}>
      <strong>{r.title}</strong><span>{r.from_date} — {r.to_date} · {r.published_at ? 'Publicado al cliente' : 'Borrador interno'}</span>
      <Link to={`/app/projects/${r.project_id}`}>Abrir proyecto</Link>
      {auth.hasCapability('report.publish') ? <div><button disabled={mutation.isPending} onClick={() => mutation.mutate({ id: r.id, publish: !r.published_at })}>
        {r.published_at ? 'Retirar publicación' : 'Publicar al cliente'}</button></div> : null}
    </li>)}</ul>{!q.data.total ? <p>No hay reportes para este proyecto.</p> : null}<Pager page={page} total={q.data.total} onPage={setPage} /></> : null}</QueryState>}</>
}
