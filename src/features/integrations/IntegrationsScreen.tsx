import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CrmError, CrmSuccess } from '../crm/ui/CrmUi'
import { disableConnection, historyQuery, invokePhase13, phase13Keys } from '../automations/api'
import { EVENT_TYPES, type Connection } from '../automations/model'
import { HistoryPager, Phase13Page, ProjectSelect, RunStatus, RunTiming, Timestamp } from '../automations/ui'
import { usePhase13Project } from '../automations/usePhase13Project'

function ProjectConnections({ project, actor, canManage }: { project: string; actor: string; canManage: boolean }) {
  const cache = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [configure, setConfigure] = useState<Connection | 'new' | null>(null)
  const [page, setPage] = useState(0)
  const [deliveryPage, setDeliveryPage] = useState(0)
  const [success, setSuccess] = useState('')
  const [formError, setFormError] = useState('')
  const connections = useQuery(historyQuery(actor, project, 'connections', page))
  const deliveries = useQuery(historyQuery(actor, project, 'deliveries', deliveryPage))
  const refresh = () => cache.invalidateQueries({ queryKey: phase13Keys.all })
  // Read the write-only field inside the request; never retain it as mutation-cache variables.
  const save = useMutation({ mutationFn: () => {
    if (!formRef.current) throw new Error('Abre el formulario de conexión para guardar.')
    const values = new FormData(formRef.current)
    return invokePhase13({ operation: 'configureIntegration', projectId: project,
      name: String(values.get('name')), endpoint: String(values.get('endpoint')), secret: String(values.get('secret')),
      eventTypes: values.getAll('eventTypes').map(String),
      connectionId: configure && configure !== 'new' ? configure.id : undefined, key: crypto.randomUUID(), consent: true })
  },
    onSuccess: async () => { formRef.current?.reset(); setConfigure(null); setSuccess('Conexión guardada. El secreto está configurado y permanece oculto.'); await refresh() } })
  const disable = useMutation({ mutationFn: disableConnection, onSuccess: refresh })
  const test = useMutation({ mutationFn: (id: string) => invokePhase13({ operation: 'testIntegration', connectionId: id, key: crypto.randomUUID(), confirmSend: true }),
    onSuccess: async () => { setSuccess('Prueba registrada. Consulta la entrega y el estado de salud.'); await refresh() } })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const eventTypes = values.getAll('eventTypes').map(String)
    if (!eventTypes.length) { setFormError('Selecciona al menos un evento permitido.'); return }
    setFormError('')
    save.mutate()
  }
  const error = connections.error ?? deliveries.error ?? save.error ?? test.error ?? disable.error
  return <>
    <div className="p13-toolbar">{canManage ? <button className="crm-button" onClick={() => setConfigure('new')}>Conectar webhook</button> : null}<button onClick={() => void refresh()}>Actualizar historial</button></div>
    {error ? <CrmError message={error.message} /> : null}{success ? <CrmSuccess message={success} /> : null}
    {configure ? <form key={configure === 'new' ? 'new' : configure.id} ref={formRef} onSubmit={submit} className="p13-card p13-form">
      <h2>{configure === 'new' ? 'Nueva conexión webhook' : 'Configurar y rotar secreto'}</h2>
      <label className="p13-field">Nombre de conexión<input name="name" required maxLength={120} defaultValue={configure === 'new' ? '' : configure.display_name} /></label>
      <label className="p13-field">Destino HTTPS<input type="url" name="endpoint" required maxLength={2048} autoComplete="off" /><small>El servidor debe permitir este destino. Desarrollo admite un receptor HTTP local configurado.</small></label>
      <label className="p13-field">Secreto de firma<input type="password" name="secret" required minLength={32} maxLength={512} autoComplete="new-password" /><small>Sólo escritura. Vuelve a introducirlo para rotarlo.</small></label>
      <fieldset><legend>Eventos permitidos</legend>{[...EVENT_TYPES, 'automation.manual'].map(type => <label className="p13-check" key={type}><input type="checkbox" name="eventTypes" value={type} defaultChecked={configure === 'new' || configure.event_allowlist.includes(type)} />{type}</label>)}</fieldset>
      {formError ? <p role="alert" className="p13-error">{formError}</p> : null}
      <label className="p13-check"><input type="checkbox" required />Autorizo esta conexión para enviar eventos mínimos de este proyecto al destino indicado</label>
      <div className="p13-actions"><button className="crm-button" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar conexión'}</button><button type="button" disabled={save.isPending} onClick={() => { formRef.current?.reset(); setConfigure(null) }}>Cancelar</button></div>
    </form> : null}
    <div className="p13-card"><h2>Conexiones del proyecto</h2>{connections.isPending ? <p role="status">Cargando conexiones…</p> : null}
      {!connections.isPending && !connections.data?.items.length ? <p>No hay conexiones configuradas.</p> : null}
      <ul className="p13-history">{connections.data?.items.map(connection => <li key={connection.id}><h3>{connection.display_name}</h3><p>Webhook genérico · Proyecto seleccionado · {connection.event_allowlist.length} eventos permitidos</p><RunStatus status={connection.status} />
        <p>Secreto: {connection.credentials_version > 0 ? '•••••••• · Configurado' : 'Pendiente de configuración'}</p><div className="p13-meta"><span>Última prueba: <Timestamp value={connection.last_health_check} /></span><span>{connection.last_health_status ? `Salud: ${connection.last_health_status}` : 'Sin prueba'}</span></div>
        {canManage ? <div className="p13-actions"><button onClick={() => setConfigure(connection)}>Configurar {connection.display_name}</button><button disabled={connection.status !== 'active' || test.isPending} onClick={() => { if (window.confirm('¿Enviar una prueba firmada al destino de esta conexión?')) test.mutate(connection.id) }}>Probar {connection.display_name}</button><button disabled={connection.status === 'disabled' || disable.isPending} onClick={() => disable.mutate(connection.id)}>Deshabilitar {connection.display_name}</button></div> : null}
      </li>)}</ul><HistoryPager page={page} total={connections.data?.total ?? 0} onPage={setPage} />
    </div>
    <div className="p13-card"><h2>Historial de entregas</h2>{!deliveries.data?.items.length ? <p>No hay entregas registradas.</p> : null}
      <ul className="p13-history">{deliveries.data?.items.map(delivery => <li key={delivery.id}><RunStatus status={delivery.status} error={delivery.safe_error} /><div className="p13-meta"><span>Intentos: {delivery.attempt}</span><span>HTTP: {delivery.last_http_status ?? '—'}</span></div><RunTiming started={delivery.created_at} finished={delivery.finished_at} /><p>Entrega: {delivery.id}</p></li>)}</ul><HistoryPager page={deliveryPage} total={deliveries.data?.total ?? 0} onPage={setDeliveryPage} />
    </div>
  </>
}
export function Component() {
  const scope = usePhase13Project('integration.view')
  return <Phase13Page title="Integraciones" description="Conexiones aprobadas por proyecto. Credenciales cifradas y entregas firmadas." error={scope.options.error}>
    <div className="p13-toolbar"><ProjectSelect scope={scope} /></div>
    {scope.selected ? <ProjectConnections key={scope.project} project={scope.project} actor={scope.actor} canManage={scope.selected.can_manage} />
      : <p role="status">{scope.options.isPending ? 'Cargando proyectos…' : 'No tienes un proyecto autorizado para integraciones.'}</p>}
  </Phase13Page>
}
