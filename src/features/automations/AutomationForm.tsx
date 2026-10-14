import { useState, type FormEvent } from 'react'
import type { Action, Automation, Connection } from './model'
import { actionSchema, EVENT_TYPES } from './model'
import type { z } from 'zod'
import type { conditionSchema } from './model'

export function AutomationForm({ initial, connections, pending, onSave, onCancel }: {
  initial?: Automation; connections: Connection[]; pending: boolean;
  onSave: (value: Omit<Automation, 'id' | 'created_at' | 'created_by' | 'revision'>) => void; onCancel: () => void;
}) {
  const [trigger, setTrigger] = useState(initial?.trigger_type ?? 'domain_event')
  const [actions, setActions] = useState<Action[]>(initial?.actions ?? [{ type: 'create_work_item', title: '', priority: 'normal' }])
  const [error, setError] = useState('')
  const [conditions, setConditions] = useState<z.infer<typeof conditionSchema>[]>(initial?.conditions ?? [])
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    if (actions.some(action => !actionSchema.safeParse(action).success)) { setError('Completa cada acción antes de guardar.'); return }
    onSave({ name: String(values.get('name')), enabled: values.get('enabled') === 'on', trigger_type: trigger,
      event_type: trigger === 'domain_event' ? String(values.get('event')) : null,
      conditions: trigger === 'domain_event' ? conditions : [], actions })
  }
  const replace = (index: number, action: Action) => setActions(current => current.map((item, position) => position === index ? action : item))
  return <form className="p13-card p13-form" onSubmit={submit}>
    <h2>{initial ? 'Configurar workflow' : 'Nuevo workflow'}</h2>
    <label className="p13-field">Nombre<input name="name" required maxLength={120} defaultValue={initial?.name} /></label>
    <div className="p13-row">
      <label className="p13-field">Disparador<select value={trigger} onChange={event => setTrigger(event.target.value as typeof trigger)}><option value="domain_event">Evento del dominio</option><option value="manual">Manual</option></select></label>
      {trigger === 'domain_event' ? <label className="p13-field">Evento<select name="event" defaultValue={initial?.event_type ?? 'work.completed'}>{EVENT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label> : null}
    </div>
    {trigger === 'domain_event' ? <fieldset><legend>Condiciones (todas deben cumplirse)</legend><div className="p13-form">
      {conditions.map((condition, index) => <div className="p13-form" key={index}><div className="p13-row">
        <label className="p13-field">Campo {index + 1}<select value={condition.field} onChange={event => setConditions(current => current.map((item, position) => position === index ? { ...item, field: event.target.value as typeof condition.field } : item))}><option value="status">Estado resultante</option><option value="event_type">Tipo de evento</option><option value="project_id">ID del proyecto</option><option value="resource_type">Tipo de recurso</option></select></label>
        <label className="p13-field">Operador {index + 1}<select value={condition.operator} onChange={event => setConditions(current => current.map((item, position) => position === index ? { ...item, operator: event.target.value as typeof condition.operator } : item))}><option value="equals">Igual a</option><option value="contains">Contiene</option><option value="exists">Existe</option></select></label>
      </div>{condition.operator !== 'exists' ? <label className="p13-field">Valor {index + 1}<input maxLength={120} value={condition.value ?? ''} onChange={event => setConditions(current => current.map((item, position) => position === index ? { ...item, value: event.target.value } : item))} /></label> : null}
        <button type="button" onClick={() => setConditions(current => current.filter((_, position) => position !== index))}>Quitar condición {index + 1}</button>
      </div>)}<button type="button" disabled={conditions.length >= 5} onClick={() => setConditions(current => [...current, { field: 'status', operator: 'equals', value: '' }])}>Añadir condición</button>
    </div></fieldset> : null}
    {actions.map((action, index) => <fieldset key={index}><legend>Acción {index + 1}</legend><div className="p13-form">
      <label className="p13-field">Tipo de acción {index + 1}<select value={action.type} onChange={event => replace(index, event.target.value === 'outbound_webhook' ? { type: 'outbound_webhook', connection_id: '' } : { type: 'create_work_item', title: '', priority: 'normal' })}>
        <option value="create_work_item">Crear trabajo en este proyecto</option><option value="outbound_webhook">Enviar webhook a conexión aprobada</option>
      </select></label>
      {action.type === 'create_work_item' ? <div className="p13-row"><label className="p13-field">Título del trabajo {index + 1}<input required maxLength={160} value={action.title} onChange={event => replace(index, { ...action, title: event.target.value })} /></label>
        <label className="p13-field">Prioridad {index + 1}<select value={action.priority} onChange={event => replace(index, { ...action, priority: event.target.value as typeof action.priority })}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label></div>
        : <label className="p13-field">Conexión {index + 1}<select required value={action.connection_id} onChange={event => replace(index, { ...action, connection_id: event.target.value })}><option value="">Selecciona conexión activa</option>{connections.filter(connection => connection.status === 'active').map(connection => <option key={connection.id} value={connection.id}>{connection.display_name}</option>)}</select><small>Al habilitar este workflow autorizas sus envíos al destino aprobado.</small></label>}
      <div className="p13-actions"><button type="button" disabled={index === 0 || pending} onClick={() => setActions(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next })}>Subir acción {index + 1}</button><button type="button" disabled={actions.length === 1 || pending} onClick={() => setActions(current => current.filter((_, position) => position !== index))}>Quitar acción {index + 1}</button></div>
    </div></fieldset>)}
    <button type="button" disabled={actions.length >= 5 || pending} onClick={() => setActions(current => [...current, { type: 'create_work_item', title: '', priority: 'normal' }])}>Añadir acción</button>
    <label className="p13-check"><input type="checkbox" name="enabled" defaultChecked={initial?.enabled} />Habilitar este workflow y autorizar sus acciones en el proyecto seleccionado</label>
    {error ? <p role="alert" className="p13-error">{error}</p> : null}
    <div className="p13-actions"><button className="crm-button" disabled={pending}>{pending ? 'Guardando…' : 'Guardar workflow'}</button><button type="button" onClick={onCancel} disabled={pending}>Cancelar</button></div>
  </form>
}
