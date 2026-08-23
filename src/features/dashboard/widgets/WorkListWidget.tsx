import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { operationalSummaryQuery } from '../api/queries'
import type { WidgetRenderProps } from '../model/dashboard'
import { formatDue } from './format'
import { WidgetList, WidgetStatus } from './widget-primitives'

export default function WorkListWidget({ config, widgetKey }: WidgetRenderProps) {
  const query = useQuery(operationalSummaryQuery())
  if (query.isPending) return <WidgetStatus>Cargando trabajo…</WidgetStatus>
  if (query.isError) return <WidgetStatus tone="error">No se pudo cargar. <button type="button" onClick={() => void query.refetch()}>Reintentar</button></WidgetStatus>
  const items = widgetKey === 'overdue-work' ? query.data.work.overdueItems : widgetKey === 'today-work' ? query.data.work.todayItems : query.data.work.upcomingItems
  if (!items.length) return <WidgetStatus>No hay elementos en esta franja.</WidgetStatus>
  return <><WidgetList>{items.slice(0, config.maxItems ?? 4).map((item) => <li key={`${item.itemKind}-${item.itemId}`}><Link to="/app/my-space"><span>{item.title}</span><small>{formatDue(item.dueAt)}</small></Link></li>)}</WidgetList><Link className="dashboard-widget__footer-link" to="/app/my-space">Ver mi espacio</Link></>
}
