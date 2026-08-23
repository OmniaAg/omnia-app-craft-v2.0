import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { crmSummaryQuery } from '../api/queries'
import type { WidgetRenderProps } from '../model/dashboard'
import { WidgetList, WidgetStatus } from './widget-primitives'

export default function CrmWidget({ config, widgetKey }: WidgetRenderProps) {
  const query = useQuery(crmSummaryQuery())
  if (query.isPending) return <WidgetStatus>Cargando CRM…</WidgetStatus>
  if (query.isError) return <WidgetStatus tone="error">No se pudo cargar. <button type="button" onClick={() => void query.refetch()}>Reintentar</button></WidgetStatus>
  if (widgetKey === 'crm-organizations') return <>{query.data.organizations.items.length ? <WidgetList>{query.data.organizations.items.slice(0, config.maxItems ?? 4).map((item) => <li key={item.organizationId}><Link to={`/app/crm/accounts/${item.organizationId}`}><span>{item.name}</span><small>{item.lifecycle}</small></Link></li>)}</WidgetList> : <WidgetStatus>No hay organizaciones autorizadas.</WidgetStatus>}<Link className="dashboard-widget__footer-link" to="/app/crm/accounts">Ver cuentas</Link></>
  return <>{query.data.opportunities.items.length ? <WidgetList>{query.data.opportunities.items.slice(0, config.maxItems ?? 4).map((item) => <li key={item.opportunityId}><Link to="/app/crm/opportunities"><span>{item.name}</span><small>{item.organizationName} · {item.stageKey}</small></Link></li>)}</WidgetList> : <WidgetStatus>No hay oportunidades abiertas.</WidgetStatus>}<Link className="dashboard-widget__footer-link" to="/app/crm/opportunities">Ver oportunidades</Link></>
}
