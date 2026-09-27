import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { portalQueries } from '../api/queries'
import { PortalHeading, PortalPager, PortalState } from '../ui/PortalPrimitives'
import { formatPortalDate } from '../ui/portal-format'

export function Component() {
  const [page, setPage] = useState(0)
  const query = useQuery(portalQueries.approvals(page))
  return <div className="portal-page"><PortalHeading title="Aprobaciones" description="Entregas publicadas que esperan tu decisión." />
    <PortalState loading={query.isLoading} error={query.error}>
      {query.data?.length ? <><div className="portal-list">{query.data.map(item =>
        <article className="portal-list__row" key={item.assignment_id}>
          <div><p className="portal-list__meta">{item.project_name} · Versión {item.version_number}</p>
            <h2><Link to={`/portal/deliverables/${item.publication_id}`}>{item.title}</Link></h2>
            <p className="portal-list__detail">Publicada el {formatPortalDate(item.published_at)}</p></div>
          <Link className="portal-action" to={`/portal/deliverables/${item.publication_id}`}>Revisar entrega</Link>
        </article>)}</div><PortalPager page={page} count={query.data.length} onPage={setPage} /></> :
        <p className="portal-empty">No tienes aprobaciones pendientes.</p>}
    </PortalState></div>
}
