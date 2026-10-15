import { useFlushDrafts } from '../../drafts/draft-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { CrmEmpty, CrmError, CrmPageHeader, CrmSuccess, StatusBadge } from '../../crm/ui/CrmUi'
import { archivePersonalWorkItem, completePersonalWorkItem, createPersonalWorkItem, personalFormValues, updatePersonalWorkItem, type MySpaceItem } from '../api/my-space-service'
import { mySpaceKeys, mySpaceQuery } from '../api/queries'
import type { PersonalWorkFormValues } from '../model/schemas'
import { PersonalWorkForm } from '../ui/PersonalWorkForm'
import '../../crm/ui/crm.css'
import '../../work/ui/work.css'
import '../ui/my-space.css'

const buckets = [
  { key: 'overdue', label: 'Vencido' },
  { key: 'today', label: 'Hoy' },
  { key: 'upcoming', label: 'Próximo' },
  { key: 'no_due_date', label: 'Sin fecha' },
] as const
const dateTime = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' })

export function Component() {
  const queryClient = useQueryClient()
  const flushDrafts=useFlushDrafts()
  const whenSafe=(action:()=>void)=>{void flushDrafts().then(saved=>{if(saved)action()})}
  const editHeadingRef = useRef<HTMLHeadingElement>(null)
  const editTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const [filter, setFilter] = useState<'all' | 'project' | 'personal'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editingItem, setEditingItem] = useState<MySpaceItem | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const closeEditor = (itemId = editingItem?.item_id) => {
    const trigger = itemId ? editTriggerRefs.current.get(itemId) : undefined
    setEditingItem(null)
    window.requestAnimationFrame(() => trigger?.focus())
  }
  const items = useQuery(mySpaceQuery())
  const filtered = useMemo(() => items.data?.filter((item) => filter === 'all' || item.item_kind === filter) ?? [], [filter, items.data])
  useEffect(() => {
    if (!editingItem) return
    editHeadingRef.current?.focus({ preventScroll: true })
    editHeadingRef.current?.scrollIntoView?.({ block: 'start' })
  }, [editingItem])
  const refresh = () => queryClient.invalidateQueries({ queryKey: mySpaceKeys.all })
  const createMutation = useMutation({ mutationFn: (values: PersonalWorkFormValues) => createPersonalWorkItem(getSupabaseClient(), values), onMutate: () => setSuccess(null), onSuccess: async () => { setSuccess('Elemento personal creado.'); setShowCreate(false); await refresh() } })
  const updateMutation = useMutation({ mutationFn: (values: PersonalWorkFormValues) => { if (!editingItem) throw new Error('Selecciona un elemento personal para editar.'); return updatePersonalWorkItem(getSupabaseClient(), editingItem, values) }, onMutate: () => setSuccess(null), onSuccess: async () => { setSuccess('Elemento personal actualizado.'); closeEditor(); await refresh() } })
  const completeMutation = useMutation({ mutationFn: (item: MySpaceItem) => completePersonalWorkItem(getSupabaseClient(), item), onMutate: () => setSuccess(null), onSuccess: async (_data, item) => { if (editingItem?.item_id === item.item_id) closeEditor(item.item_id); setSuccess('Elemento personal completado.'); await refresh() } })
  const archiveMutation = useMutation({ mutationFn: (itemId: string) => archivePersonalWorkItem(getSupabaseClient(), itemId), onMutate: () => setSuccess(null), onSuccess: async (_data, itemId) => { if (editingItem?.item_id === itemId) closeEditor(itemId); setSuccess('Elemento personal archivado.'); await refresh() } })
  const mutationError = createMutation.error ?? updateMutation.error ?? completeMutation.error ?? archiveMutation.error

  return (
    <section className="crm-page my-space-page">
      <CrmPageHeader title="Mi Espacio" description="Trabajo asignado y elementos personales, ordenados por el calendario de Ciudad de México." action={<button className="crm-button crm-button--primary" type="button" aria-expanded={showCreate} onClick={() => whenSafe(() => { setEditingItem(null); setShowCreate(value => !value) })}>{showCreate ? 'Cerrar formulario' : 'Nuevo elemento'}</button>} />
      <p><Link className="crm-row-link" to="/app/reviews">Ver revisiones pendientes</Link></p>
      {success ? <CrmSuccess message={success} /> : null}
      {mutationError ? <CrmError message={mutationError.message} /> : null}
      {showCreate ? <section className="crm-editor" aria-labelledby="personal-work-title"><h2 id="personal-work-title">Crear elemento personal</h2><PersonalWorkForm pending={createMutation.isPending} onSubmit={(values) => createMutation.mutateAsync(values).then(() => undefined)} /></section> : null}
      {editingItem ? <section className="crm-editor" aria-labelledby="edit-personal-work-title"><div className="my-space-editor-header"><h2 id="edit-personal-work-title" ref={editHeadingRef} tabIndex={-1}>Editar elemento personal</h2><button className="crm-button" type="button" onClick={() => whenSafe(() => closeEditor())}>Cancelar edición</button></div><PersonalWorkForm key={editingItem.item_id} initialValues={personalFormValues(editingItem)} submitLabel="Guardar cambios" pending={updateMutation.isPending} onSubmit={(values) => updateMutation.mutateAsync(values).then(() => undefined)} /></section> : null}
      <div className="my-space-filter" role="group" aria-label="Filtrar Mi Espacio">
        {([['all', 'Todo'], ['project', 'Asignado'], ['personal', 'Personal']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      {items.error ? <CrmError message={items.error.message} /> : null}
      {items.isPending ? <p role="status">Cargando Mi Espacio…</p> : null}
      {!items.isPending && filtered.length === 0 ? <CrmEmpty title="Tu espacio está despejado" description="Cambia el filtro, crea un elemento personal o espera una nueva asignación." /> : null}
      <div className="my-space-buckets">
        {buckets.map((bucket) => {
          const bucketItems = filtered.filter((item) => item.bucket === bucket.key)
          if (bucketItems.length === 0) return null
          return (
            <section key={bucket.key} className="my-space-bucket" data-bucket={bucket.key} aria-labelledby={`bucket-${bucket.key}`}>
              <header><h2 id={`bucket-${bucket.key}`}>{bucket.label}</h2><span>{bucketItems.length}</span></header>
              <ul>
                  {bucketItems.map((item) => (
                    <li key={`${item.item_kind}-${item.item_id}`}>
                      <div className="my-space-item__body">
                        <div><StatusBadge value={item.item_kind === 'project' ? 'assigned' : item.item_type} /><StatusBadge value={item.priority} /></div>
                        <h3>{item.title}</h3>
                        {item.description ? <p>{item.description}</p> : null}
                        <span>{item.item_kind === 'project' ? `${item.organization_name} · ${item.brand_name} · ${item.project_name}` : 'Privado · solo tú'}</span>
                        {item.due_at ? <time dateTime={item.due_at}>{dateTime.format(new Date(item.due_at))}</time> : null}
                      </div>
                      <div className="my-space-item__actions">
                        {item.item_kind === 'project' ? <Link className="crm-row-link" to={`/app/projects/${item.project_id}?tab=work&workItem=${item.item_id}`}>Abrir trabajo</Link> : <><button ref={(node) => { if (node) editTriggerRefs.current.set(item.item_id, node); else editTriggerRefs.current.delete(item.item_id) }} className="crm-button" type="button" disabled={completeMutation.isPending || archiveMutation.isPending || updateMutation.isPending} onClick={() => whenSafe(() => { setShowCreate(false); setSuccess(null); setEditingItem(item) })}>Editar</button><button className="crm-button" type="button" disabled={completeMutation.isPending || archiveMutation.isPending || updateMutation.isPending} aria-busy={completeMutation.isPending && completeMutation.variables?.item_id === item.item_id} onClick={() => whenSafe(() => completeMutation.mutate(item))}>{completeMutation.isPending && completeMutation.variables?.item_id === item.item_id ? 'Completando…' : 'Completar'}</button><button className="work-danger-action" type="button" disabled={archiveMutation.isPending || completeMutation.isPending || updateMutation.isPending} aria-busy={archiveMutation.isPending && archiveMutation.variables === item.item_id} onClick={() => { if (window.confirm(`¿Archivar “${item.title}”?`)) archiveMutation.mutate(item.item_id) }}>{archiveMutation.isPending && archiveMutation.variables === item.item_id ? 'Archivando…' : 'Archivar'}</button></>}
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}
