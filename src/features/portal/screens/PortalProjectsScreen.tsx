import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portalQueries } from '../api/queries'
import { PortalHeading, PortalPager, PortalState, ProjectList } from '../ui/PortalPrimitives'

export function Component() {
  const [page, setPage] = useState(0)
  const query = useQuery(portalQueries.projects(page))
  return <div className="portal-page"><PortalHeading title="Proyectos" description="Sólo aparecen los proyectos a los que tienes acceso asignado." />
    <PortalState loading={query.isLoading} error={query.error}>
      {query.data?.length ? <><ProjectList projects={query.data} />
        <PortalPager page={page} count={query.data.length} onPage={setPage} /></> :
        <p className="portal-empty">No tienes proyectos asignados todavía. Contacta a tu equipo de OMNIA si esperabas ver uno.</p>}
    </PortalState></div>
}
