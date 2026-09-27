import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { CrmEmpty, CrmError, CrmPageHeader, CrmSuccess, StatusBadge } from '../../crm/ui/CrmUi'
import { createWorkItem } from '../../work/api/work-service'
import { projectWorkQuery, workKeys } from '../../work/api/queries'
import type { WorkItemFormValues } from '../../work/model/schemas'
import { WorkItemForm } from '../../work/ui/WorkForms'
import { WorkPanel } from '../../work/ui/WorkPanel'
import { addProjectMember, archiveProject, createMilestone, revokeProjectMember } from '../api/project-service'
import { projectCandidatesQuery, projectDetailQuery, projectKeys, projectMembersQuery, projectMilestonesQuery } from '../api/queries'
import type { MilestoneFormValues, ProjectMemberFormValues } from '../model/schemas'
import { MilestoneForm, ProjectMemberForm } from '../ui/ProjectForms'
import '../../crm/ui/crm.css'
import '../../work/ui/work.css'
import '../ui/projects.css'

const dateOnly = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' })
const dateTime = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' })
const displayDate = (value: string) => dateOnly.format(new Date(`${value}T00:00:00Z`))
const responsibilityLabels: Record<string, string> = { lead: 'Lead', member: 'Miembro', client_member: 'Miembro cliente' }
const responsibilityLabel = (value: string) => responsibilityLabels[value] ?? value

export function Component() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const focusedProjectId = useRef<string | null>(null)
  const workTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const [success, setSuccess] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'work' ? 'work' : 'overview'
  const selectedWorkId = params.get('workItem')
  const project = useQuery(projectDetailQuery(projectId))
  const members = useQuery(projectMembersQuery(projectId))
  const milestones = useQuery(projectMilestonesQuery(projectId))
  const work = useQuery(projectWorkQuery(projectId))
  const candidates = useQuery({ ...projectCandidatesQuery(projectId), enabled: Boolean(project.data?.can_manage_members) })

  useEffect(() => {
    if (!project.data || focusedProjectId.current === projectId) return
    focusedProjectId.current = projectId
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-route-heading]')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [project.data, projectId])
  const invalidateProject = () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
  const memberMutation = useMutation({
    mutationFn: (values: ProjectMemberFormValues) => {
      const candidate = candidates.data?.find((item) => item.user_id === values.userId)
      if (!candidate) throw new Error('Selecciona una persona disponible.')
      return addProjectMember(getSupabaseClient(), projectId, candidate)
    },
    onMutate: () => setSuccess(null),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }), queryClient.invalidateQueries({ queryKey: projectKeys.candidates(projectId) })]); setSuccess('Miembro añadido al proyecto.') },
  })
  const revokeMutation = useMutation({
    mutationFn: (membershipId: string) => revokeProjectMember(getSupabaseClient(), membershipId),
    onMutate: () => setSuccess(null),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }), queryClient.invalidateQueries({ queryKey: projectKeys.candidates(projectId) }), queryClient.invalidateQueries({ queryKey: workKeys.project(projectId) })]); setSuccess('Membership revocada.') },
  })
  const milestoneMutation = useMutation({
    mutationFn: (values: MilestoneFormValues) => createMilestone(getSupabaseClient(), projectId, values),
    onMutate: () => setSuccess(null),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) }); setSuccess('Hito creado.') },
  })
  const workMutation = useMutation({
    mutationFn: (values: WorkItemFormValues) => createWorkItem(getSupabaseClient(), projectId, values),
    onMutate: () => setSuccess(null),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: workKeys.project(projectId) }), queryClient.invalidateQueries({ queryKey: ['my-space'] })]); setSuccess('Trabajo creado.') },
  })
  const archiveMutation = useMutation({
    mutationFn: () => archiveProject(getSupabaseClient(), projectId),
    onMutate: () => setSuccess(null),
    onSuccess: async () => { await invalidateProject(); navigate('/app/projects') },
  })
  const selectedWork = work.data?.find((item) => item.work_item_id === selectedWorkId)
  const error = project.error ?? members.error ?? milestones.error ?? work.error

  if (project.isPending) return <section className="crm-page"><CrmPageHeader title="Proyecto" description="Cargando contexto autorizado…" /><p role="status">Cargando proyecto…</p></section>
  if (project.error || !project.data) return <section className="crm-page"><Link className="crm-back-link" to="/app/projects">← Volver a proyectos</Link><CrmPageHeader title="Proyecto no disponible" description="No encontramos un proyecto visible dentro de tu scope actual." /><CrmError message={project.error?.message ?? 'No pudimos abrir el proyecto.'} /></section>
  const detail = project.data
  const isArchived = detail.project_status === 'archived'

  const setTab = (nextTab: 'overview' | 'work') => setParams((current) => {
    if (nextTab === 'overview') current.delete('tab'); else current.set('tab', nextTab)
    current.delete('workItem')
    return current
  })
  const openWork = (workItemId: string) => setParams((current) => { current.set('tab', 'work'); current.set('workItem', workItemId); return current })
  const closeWork = () => {
    const trigger = selectedWorkId ? workTriggerRefs.current.get(selectedWorkId) : undefined
    setParams((current) => { current.delete('workItem'); return current })
    window.requestAnimationFrame(() => trigger?.focus())
  }

  return (
    <section className="crm-page project-page">
      <Link className="crm-back-link" to="/app/projects">← Volver a proyectos</Link>
      <CrmPageHeader
        title={detail.project_name}
        description={`${detail.organization_name} · ${detail.brand_name} · ${detail.timezone}`}
        action={<div className="project-header-actions"><Link className="crm-row-link" to={`/app/projects/${projectId}/editorial`}>Editorial</Link><Link className="crm-row-link" to={`/app/content-manager?project=${projectId}`}>Archivos</Link><Link className="crm-row-link" to={`/app/projects/${projectId}/reviews`}>Revisores</Link><StatusBadge value={detail.project_status} />{detail.can_archive_project && !isArchived ? <button className="work-danger-action" type="button" disabled={archiveMutation.isPending} onClick={() => { if (window.confirm(`¿Archivar “${detail.project_name}”?`)) archiveMutation.mutate() }}>{archiveMutation.isPending ? 'Archivando…' : 'Archivar proyecto'}</button> : null}</div>}
      />
      {error ? <CrmError message={error.message} /> : null}
      {success ? <CrmSuccess message={success} /> : null}
      {archiveMutation.error ? <CrmError message={archiveMutation.error.message} /> : null}
      <div className="crm-tabs" aria-label="Secciones del proyecto">
        <button type="button" aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Resumen</button>
        <button type="button" aria-pressed={tab === 'work'} onClick={() => setTab('work')}>Trabajo</button>
      </div>
      {tab === 'overview' ? (
        <div className="project-overview">
          <section className="crm-section" aria-labelledby="project-context-title">
            <h2 id="project-context-title">Contexto</h2>
            {detail.project_description ? <p>{detail.project_description}</p> : <p className="work-muted">Sin descripción.</p>}
            <dl className="work-facts work-facts--grid">
              <div><dt>Responsabilidad</dt><dd>{detail.responsibility ? responsibilityLabel(detail.responsibility) : 'Alcance directivo'}</dd></div>
              <div><dt>Inicio</dt><dd>{detail.start_date ? displayDate(detail.start_date) : 'Sin fecha'}</dd></div>
              <div><dt>Objetivo</dt><dd>{detail.target_end_date ? displayDate(detail.target_end_date) : 'Sin fecha'}</dd></div>
            </dl>
          </section>
          <div className="crm-detail-grid">
            <section className="crm-section" aria-labelledby="project-members-title">
              <h2 id="project-members-title">Miembros</h2>
              {members.isPending ? <p role="status">Cargando miembros…</p> : null}
              <ul className="project-member-list">
                {members.data?.map((member) => (
                  <li key={member.membership_id}>
                    <div><strong>{member.display_name}</strong><span>{member.member_type === 'client' ? 'Cliente' : 'Interno'} · {responsibilityLabel(member.responsibility)}</span></div>
                    <StatusBadge value={member.status} />
                    {detail.can_manage_members && member.status === 'active' ? <button className="crm-button" type="button" disabled={revokeMutation.isPending} aria-busy={revokeMutation.isPending} onClick={() => { if (window.confirm(`¿Revocar el acceso de ${member.display_name}?`)) revokeMutation.mutate(member.membership_id) }}>{revokeMutation.isPending ? 'Revocando…' : 'Revocar'}</button> : null}
                  </li>
                ))}
              </ul>
              {revokeMutation.error ? <CrmError message={revokeMutation.error.message} /> : null}
              {detail.can_manage_members && !isArchived ? <div className="project-inline-editor"><h3>Añadir miembro</h3>{candidates.isPending ? <p role="status">Cargando candidatos…</p> : null}{candidates.error ? <CrmError message={candidates.error.message} /> : null}{candidates.data ? <ProjectMemberForm candidates={candidates.data} pending={memberMutation.isPending} onSubmit={(values) => memberMutation.mutateAsync(values).then(() => undefined)} /> : null}{memberMutation.error ? <CrmError message={memberMutation.error.message} /> : null}</div> : null}
            </section>
            <section className="crm-section" aria-labelledby="project-milestones-title">
              <h2 id="project-milestones-title">Hitos</h2>
              {milestones.isPending ? <p role="status">Cargando hitos…</p> : null}
              <ol className="project-milestone-list">
                {milestones.data?.map((milestone) => <li key={milestone.milestone_id}><div><strong>{milestone.milestone_name}</strong>{milestone.description ? <span>{milestone.description}</span> : null}</div><StatusBadge value={milestone.status} /><time dateTime={milestone.due_date || undefined}>{milestone.due_date ? displayDate(milestone.due_date) : 'Sin fecha'}</time></li>)}
              </ol>
              {!milestones.isPending && milestones.data?.length === 0 ? <p className="work-muted">Todavía no hay hitos.</p> : null}
              {detail.can_manage_milestones && !isArchived ? <div className="project-inline-editor"><h3>Nuevo hito</h3><MilestoneForm pending={milestoneMutation.isPending} onSubmit={(values) => milestoneMutation.mutateAsync(values).then(() => undefined)} />{milestoneMutation.error ? <CrmError message={milestoneMutation.error.message} /> : null}</div> : null}
            </section>
          </div>
        </div>
      ) : (
        <div className={selectedWork ? 'project-work-layout project-work-layout--open' : 'project-work-layout'}>
          <div className="project-work-main">
            {detail.can_create_work && !isArchived ? <section className="crm-editor" aria-labelledby="new-work-title"><h2 id="new-work-title">Crear trabajo</h2><WorkItemForm members={members.data ?? []} milestones={milestones.data ?? []} pending={workMutation.isPending} onSubmit={(values) => workMutation.mutateAsync(values).then(() => undefined)} />{workMutation.error ? <CrmError message={workMutation.error.message} /> : null}</section> : null}
            <div className="crm-table-wrap"><table className="crm-table"><caption className="sr-only">Trabajo del proyecto</caption><thead><tr><th scope="col">Trabajo</th><th scope="col">Estado</th><th scope="col">Prioridad</th><th scope="col">Responsables</th><th scope="col">Vence</th><th scope="col"><span className="sr-only">Acción</span></th></tr></thead><tbody>{work.isPending ? <tr className="crm-loading-row"><td colSpan={6}><span role="status">Cargando trabajo…</span></td></tr> : null}{work.data?.map((item) => <tr key={item.work_item_id}><th scope="row">{item.title}<span className="crm-cell-detail">{item.milestone_name || 'Sin hito'}</span></th><td><StatusBadge value={item.status} /></td><td><StatusBadge value={item.priority} /></td><td>{item.assignee_names.length ? item.assignee_names.join(', ') : 'Sin responsables'}</td><td>{item.due_at ? dateTime.format(new Date(item.due_at)) : 'Sin fecha'}</td><td><button ref={(node) => { if (node) workTriggerRefs.current.set(item.work_item_id, node); else workTriggerRefs.current.delete(item.work_item_id) }} className="crm-button" type="button" onClick={() => openWork(item.work_item_id)} aria-pressed={selectedWorkId === item.work_item_id}>Ver detalle</button></td></tr>)}</tbody></table></div>
            {!work.isPending && work.data?.length === 0 ? <CrmEmpty title="No hay trabajo en este proyecto" description={detail.can_create_work ? 'Crea el primer elemento de trabajo con responsables opcionales.' : 'El project manager todavía no ha creado trabajo.'} /> : null}
          </div>
          {selectedWork ? <WorkPanel key={selectedWork.work_item_id} projectId={projectId} item={selectedWork} members={members.data ?? []} onClose={closeWork} /> : null}
        </div>
      )}
    </section>
  )
}
