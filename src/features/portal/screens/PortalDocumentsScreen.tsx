import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { FileActions } from '../../files/ui/FileActions'
import { portalQueries } from '../api/queries'
import { PortalHeading, PortalPager, PortalState } from '../ui/PortalPrimitives'
import { formatPortalDate } from '../ui/portal-format'

export function Component() {
  const [params] = useSearchParams()
  const [page, setPage] = useState(0)
  const projectId = params.get('project') ?? undefined
  const query = useQuery(portalQueries.documents(projectId, page))
  return <div className="portal-page"><PortalHeading title="Documentos" description="Archivos de documento vinculados a versiones publicadas para ti." />
    <PortalState loading={query.isLoading} error={query.error}>
      {query.data?.length ? <><div className="portal-list">{query.data.map(item =>
        <article className="portal-list__row" key={`${item.publication_id}-${item.asset_id}`}>
          <div><p className="portal-list__meta">{item.project_name} · {item.deliverable_title} · V{item.version_number}</p>
            <h2>{item.original_filename}</h2><p className="portal-list__detail">Publicado el {formatPortalDate(item.published_at)} · {Math.ceil(item.size_bytes / 1024)} KB</p>
            <Link to={`/portal/deliverables/${item.publication_id}`}>Ver entrega</Link></div>
          <FileActions asset={item} />
        </article>)}</div><PortalPager page={page} count={query.data.length} onPage={setPage} /></> :
        <p className="portal-empty">Todavía no hay documentos publicados para este acceso.</p>}
    </PortalState></div>
}
