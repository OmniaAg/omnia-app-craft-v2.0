import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { CrmError, CrmPageHeader, CrmSuccess } from '../../crm/ui/CrmUi'
import { projectDetailQuery } from '../../projects/api/queries'
import { reviewConfigurationQuery, reviewKeys } from '../api/queries'
import { configureReviewers, type ReviewConfiguration } from '../api/review-service'
import '../ui/reviews.css'
import '../../crm/ui/crm.css'

function ReviewerForm({ projectId, deliverableId, configuration }: { projectId: string; deliverableId: string | null; configuration: ReviewConfiguration }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>(configuration.requirements.map((item) => item.reviewer_id))
  const [success, setSuccess] = useState(false)
  const key = useRef<string | null>(null)
  const save = useMutation({
    mutationFn: () => configureReviewers(getSupabaseClient(), projectId, deliverableId, selected, key.current ??= crypto.randomUUID()),
    onSuccess: async () => {
      key.current = null
      await queryClient.invalidateQueries({ queryKey: reviewKeys.configuration(projectId, deliverableId) })
      setSuccess(true)
    },
  })
  const toggle = (id: string) => {
    key.current = null
    setSuccess(false)
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }
  const submit = (event: FormEvent) => { event.preventDefault(); if (selected.length) save.mutate() }
  return <form className="review-form" onSubmit={submit}>
    <fieldset disabled={save.isPending}>
      <legend>Revisores requeridos {deliverableId ? 'de esta entrega' : 'del proyecto'}</legend>
      <p>Cada nueva ronda guardará estos reviewers. Las rondas existentes conservarán sus asignaciones.</p>
      {configuration.candidates.map((candidate) => <label className="review-choice" key={candidate.user_id}>
        <input type="checkbox" checked={selected.includes(candidate.user_id)} onChange={() => toggle(candidate.user_id)} />
        {candidate.display_name}
      </label>)}
    </fieldset>
    {selected.length === 0 ? <p role="alert">Selecciona al menos un reviewer.</p> : null}
    {save.error ? <CrmError message={save.error.message} /> : null}
    {success ? <CrmSuccess message="Revisores guardados para futuras rondas." /> : null}
    <button className="crm-button crm-button--primary" type="submit" disabled={save.isPending || selected.length === 0}>
      {save.isPending ? 'Guardando…' : 'Guardar reviewers'}
    </button>
  </form>
}

export function Component() {
  const { projectId = '' } = useParams()
  const [params] = useSearchParams()
  const deliverableId = params.get('deliverableId')
  const project = useQuery(projectDetailQuery(projectId))
  const configuration = useQuery(reviewConfigurationQuery(projectId, deliverableId))
  return <section className="crm-page reviews-page">
    <Link className="crm-back-link" to={`/app/projects/${projectId}`}>← Volver al proyecto</Link>
    <CrmPageHeader title="Configuración de revisión" description={`${project.data?.project_name ?? 'Proyecto'} · ${deliverableId ? 'Entrega específica' : 'Defaults del proyecto'}`} />
    {configuration.isPending ? <p role="status">Cargando configuración…</p> : null}
    {configuration.error ? <CrmError message={configuration.error.message} /> : null}
    {configuration.data ? <>
      {configuration.data.requirements.length > 0 ? <p>Actuales: {configuration.data.requirements.map((item) => item.reviewer_name).join(', ')}</p>
        : <p role="status">{deliverableId ? 'Esta entrega usa los reviewers del proyecto.' : 'Aún no hay reviewers configurados; ninguna versión podrá enviarse.'}</p>}
      {configuration.data.can_configure ? <ReviewerForm key={configuration.data.requirements.map((item) => item.id).join(':')} projectId={projectId} deliverableId={deliverableId} configuration={configuration.data} />
        : <p>Tu acceso permite consultar esta configuración.</p>}
    </> : null}
  </section>
}
