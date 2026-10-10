import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context/AuthContext'
import { analyticsQueries } from './api'
import { labels } from './model'
import { Distribution, Metrics, Pager, QueryState } from './ui'
import { stamp } from './format'
import './analytics.css'

function PublishedReport({ actor, id }: { actor: string; id: string }) {
  const q = useQuery(analyticsQueries.clientReport(actor, id))
  return <QueryState loading={q.isPending} error={q.error}>{q.data ? <section className="analytics-page">
    <h2>{q.data.title}</h2><p><Link to={`/portal/projects/${q.data.project_id}`}>{q.data.project_name}</Link> · {labels[q.data.project_status]}</p>
    <p>{q.data.from} — {q.data.to} · Publicado {stamp(q.data.published_at)}</p>
    <p>Reporte actual consultado {stamp(q.data.as_of)}. Los hitos reflejan el estado actual; entregas, aprobaciones y documentos corresponden a publicaciones del periodo.</p>
    <Metrics values={[
      ['Hitos completos', q.data.milestones_done], ['Hitos pendientes', q.data.milestones_pending],
      ['Entregas publicadas en periodo', q.data.published_deliverables], ['Documentos publicados en periodo', q.data.published_documents],
    ]} /><Distribution title="Estado actual de aprobaciones del periodo" values={q.data.approvals} />
    <div className="analytics-actions"><Link to={`/portal/projects/${q.data.project_id}`}>Ver entregas e hitos del proyecto</Link><Link to="/portal/documents">Ver documentos publicados</Link></div>
  </section> : null}</QueryState>
}
export function Component() {
  const auth = useAuth()
  const actor = auth.actor?.user.id ?? ''
  const [page, setPage] = useState(0)
  const [params, setParams] = useSearchParams()
  const cache = useQueryClient()
  const q = useQuery(analyticsQueries.reports(actor, undefined, page))
  const selected = params.get('report')
  return <div className="analytics-page"><header className="analytics-heading"><div><h1 data-route-heading tabIndex={-1}>Reportes</h1>
    <p>Reportes que OMNIA publicó para tus proyectos asignados.</p></div><button onClick={() => void cache.invalidateQueries({ queryKey: ['analytics', actor] })}>Actualizar</button></header>
    <QueryState loading={q.isPending} error={q.error}>{q.data ? <><ul className="analytics-report-list">{q.data.items.map(r => <li key={r.id}>
      <button aria-pressed={selected === r.id} onClick={() => setParams({ report: r.id })}>{r.title}</button><span>{r.from_date} — {r.to_date}</span>
    </li>)}</ul>{!q.data.total ? <p>No hay reportes publicados todavía.</p> : null}<Pager page={page} total={q.data.total} onPage={setPage} /></> : null}</QueryState>
    {selected ? <PublishedReport key={selected} actor={actor} id={selected} /> : null}
  </div>
}
