import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { operationalSummaryQuery } from '../api/queries'
import type { WidgetRenderProps } from '../model/dashboard'
import { WidgetList, WidgetStatus } from './widget-primitives'

export default function ProjectsWidget({ config }: WidgetRenderProps) {
  const query = useQuery(operationalSummaryQuery())
  if (query.isPending) return <WidgetStatus>Cargando proyectos…</WidgetStatus>
  if (query.isError) return <WidgetStatus tone="error">No se pudo cargar. <button type="button" onClick={() => void query.refetch()}>Reintentar</button></WidgetStatus>
  return <><div className="dashboard-widget__inline-metrics"><span><strong>{query.data.projects.activeCount}</strong> activos</span><span><strong>{query.data.projects.attentionCount}</strong> con atención</span></div>{query.data.projects.items.length ? <WidgetList>{query.data.projects.items.slice(0, config.maxItems ?? 5).map((project) => <li key={project.projectId}><Link to={`/app/projects/${project.projectId}`}><span>{project.projectName}</span><small>{project.brandName} · {project.status}</small></Link></li>)}</WidgetList> : <WidgetStatus>No hay proyectos autorizados.</WidgetStatus>}<Link className="dashboard-widget__footer-link" to="/app/projects">Ver proyectos</Link></>
}
