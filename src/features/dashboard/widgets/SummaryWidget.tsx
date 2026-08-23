import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { operationalSummaryQuery } from '../api/queries'
import type { WidgetRenderProps } from '../model/dashboard'
import { WidgetStatus } from './widget-primitives'

export default function SummaryWidget({ config }: WidgetRenderProps) {
  const query = useQuery(operationalSummaryQuery())
  if (query.isPending) return <WidgetStatus>Cargando resumen…</WidgetStatus>
  if (query.isError) return <WidgetStatus tone="error">No se pudo cargar. <button type="button" onClick={() => void query.refetch()}>Reintentar</button></WidgetStatus>
  const counts = query.data.work.counts
  return <div className="dashboard-metrics" data-max-items={config.maxItems ?? 4}>
    <Link to="/app/my-space"><strong>{counts.total}</strong><span>abiertos</span></Link>
    <Link to="/app/my-space"><strong>{counts.overdue}</strong><span>vencidos</span></Link>
    <Link to="/app/my-space"><strong>{counts.today}</strong><span>para hoy</span></Link>
  </div>
}
