import { useState, type FormEvent } from 'react'
import type { z } from 'zod'
import { useServerDraft } from '../drafts/useServerDraft'
import { DraftStatus } from '../drafts/DraftStatus'
import type { Action, Automation, Connection, conditionSchema } from './model'
import { actionSchema, EVENT_TYPES } from './model'
import './workflow.css'

type Workflow = Omit<Automation,'id'|'created_at'|'created_by'|'revision'>
type Condition = z.infer<typeof conditionSchema>
const eventLabels: Record<string,string> = {'work.created':'Trabajo creado','work.completed':'Trabajo completado','work.status_changed':'Cambio de estado del trabajo','deliverable.published_to_client':'Entregable publicado al cliente','review.changes_requested':'Cambios solicitados en revisión'}
const fieldLabels: Record<Condition['field'],string> = {status:'Estado resultante',event_type:'Tipo de evento',project_id:'ID del proyecto',resource_type:'Tipo de recurso'}
const operatorLabels: Record<Condition['operator'],string> = {equals:'Igual a',contains:'Contiene',exists:'Existe'}

export function AutomationForm({initial,connections,pending,onSave,onCommitted,onCancel,projectId}:{initial?:Automation;connections:Connection[];pending:boolean;projectId:string;onSave:(value:Workflow)=>Promise<Automation>;onCommitted:(value:Automation)=>void;onCancel:()=>void}) {
  const draft=useServerDraft<Workflow>('automation',projectId,initial?.id??'new-workflow',{name:initial?.name??'',enabled:initial?.enabled??false,trigger_type:initial?.trigger_type??'domain_event',event_type:initial?.event_type??'work.completed',conditions:initial?.conditions??[],actions:initial?.actions??[{type:'create_work_item',title:'',priority:'normal'}]})
  const workflow=draft.value
  const [error,setError]=useState('')
  const [preview,setPreview]=useState(false)
  const [submitting,setSubmitting]=useState(false)
  const update=(value:Partial<Workflow>)=>draft.setValue(current=>({...current,...value}))
  const replaceAction=(index:number,action:Action)=>update({actions:workflow.actions.map((item,position)=>position===index?action:item)})
  const replaceCondition=(index:number,value:Partial<Condition>)=>update({conditions:workflow.conditions.map((item,position)=>position===index?{...item,...value}:item)})
  const invalidAction=(action:Action)=>!actionSchema.safeParse(action).success||(action.type==='outbound_webhook'&&!connections.some(connection=>connection.id===action.connection_id&&connection.status==='active'))
  const invalidCondition=(condition:Condition)=>condition.operator!=='exists'&&!condition.value?.trim()
  const valid=workflow.name.trim().length>0&&workflow.actions.length>0&&!workflow.actions.some(invalidAction)&&(workflow.trigger_type==='manual'||!workflow.conditions.some(invalidCondition))
  const state=(configured:boolean)=>!configured?'Incompleto':workflow.enabled?'Configurado':'Deshabilitado'
  const move=(index:number,direction:-1|1)=>{const actions=[...workflow.actions];[actions[index],actions[index+direction]]=[actions[index+direction],actions[index]];update({actions})}
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!valid){setError('Completa el nombre, las condiciones y cada acción antes de guardar.');return}
    setSubmitting(true);setError('')
    try {
      if(!await draft.flush()){setError('Resuelve el guardado del borrador antes de guardar el workflow.');return}
      const saved=await onSave({...workflow,name:workflow.name.trim(),event_type:workflow.trigger_type==='manual'?null:workflow.event_type,conditions:workflow.trigger_type==='manual'?[]:workflow.conditions})
      if(await draft.clear())onCommitted(saved)
    }catch{setError('No pudimos guardar el workflow. Tu configuración permanece en el editor.')}finally{setSubmitting(false)}
  }
  return <form className="p13-form workflow-editor" data-server-draft onSubmit={event=>void submit(event)}>
    <div className="workflow-editor__heading"><h2>{initial?'Configurar workflow':'Nuevo workflow'}</h2><button type="button" aria-expanded={preview} onClick={()=>setPreview(value=>!value)}>Vista previa</button></div>
    <DraftStatus draft={draft}/>
    <fieldset disabled={!draft.ready||pending||submitting} className="workflow-editor__fields">
      <label className="p13-field">Nombre<input name="name" required maxLength={120} value={workflow.name} onChange={event=>update({name:event.target.value})}/></label>
      <ol className="workflow-sequence" aria-label="Secuencia del workflow">
        <li className="workflow-step"><div className="workflow-step__heading"><h3>Disparador</h3><span>{state(true)}</span></div>
          <div className="p13-row"><label className="p13-field">Disparador<select value={workflow.trigger_type} onChange={event=>update({trigger_type:event.target.value as Workflow['trigger_type']})}><option value="domain_event">Evento del dominio</option><option value="manual">Manual</option></select></label>
          {workflow.trigger_type==='domain_event'?<label className="p13-field">Evento<select name="event" value={workflow.event_type??'work.completed'} onChange={event=>update({event_type:event.target.value})}>{EVENT_TYPES.map(type=><option key={type} value={type}>{eventLabels[type]}</option>)}</select></label>:<p>Se ejecuta al pulsar Ejecutar en el historial del proyecto.</p>}</div>
        </li>
        {workflow.trigger_type==='domain_event'?<li className="workflow-step"><div className="workflow-step__heading"><h3>Condiciones</h3><span>{state(!workflow.conditions.some(invalidCondition))}</span></div><p>Todas deben cumplirse. Sin condiciones, el evento seleccionado es suficiente.</p>
          {workflow.conditions.map((condition,index)=><fieldset className="workflow-condition" key={index}><legend>Condición {index+1}</legend><div className="p13-row">
            <label className="p13-field">Campo {index+1}<select value={condition.field} onChange={event=>replaceCondition(index,{field:event.target.value as Condition['field']})}>{Object.entries(fieldLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="p13-field">Operador {index+1}<select value={condition.operator} onChange={event=>replaceCondition(index,{operator:event.target.value as Condition['operator']})}>{Object.entries(operatorLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          </div>{condition.operator!=='exists'?<label className="p13-field">Valor {index+1}<input required maxLength={120} value={condition.value??''} onChange={event=>replaceCondition(index,{value:event.target.value})}/></label>:null}<button type="button" onClick={()=>update({conditions:workflow.conditions.filter((_,position)=>position!==index)})}>Quitar condición {index+1}</button></fieldset>)}
          <button type="button" disabled={workflow.conditions.length>=5} onClick={()=>update({conditions:[...workflow.conditions,{field:'status',operator:'equals',value:''}]})}>Añadir condición</button>
        </li>:null}
        {workflow.actions.map((action,index)=><li className="workflow-step" key={index}><div className="workflow-step__heading"><h3>Acción {index+1}</h3><span>{state(!invalidAction(action))}</span></div>
          <label className="p13-field">Tipo de acción {index+1}<select value={action.type} onChange={event=>replaceAction(index,event.target.value==='outbound_webhook'?{type:'outbound_webhook',connection_id:''}:{type:'create_work_item',title:'',priority:'normal'})}><option value="create_work_item">Crear trabajo en este proyecto</option><option value="outbound_webhook">Enviar webhook a conexión aprobada</option></select></label>
          {action.type==='create_work_item'?<div className="p13-row"><label className="p13-field">Título del trabajo {index+1}<input required maxLength={160} value={action.title} onChange={event=>replaceAction(index,{...action,title:event.target.value})}/></label><label className="p13-field">Prioridad {index+1}<select value={action.priority} onChange={event=>replaceAction(index,{...action,priority:event.target.value as typeof action.priority})}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label></div>:<label className="p13-field">Conexión {index+1}<select required value={action.connection_id} onChange={event=>replaceAction(index,{...action,connection_id:event.target.value})}><option value="">Selecciona conexión activa</option>{connections.filter(connection=>connection.status==='active').map(connection=><option key={connection.id} value={connection.id}>{connection.display_name}</option>)}</select><small>Los envíos usan el destino aprobado de esta conexión.</small></label>}
          <div className="p13-actions"><button type="button" disabled={index===0} onClick={()=>move(index,-1)}>Subir acción {index+1}</button><button type="button" disabled={index===workflow.actions.length-1} onClick={()=>move(index,1)}>Bajar acción {index+1}</button><button type="button" disabled={workflow.actions.length===1} onClick={()=>update({actions:workflow.actions.filter((_,position)=>position!==index)})}>Quitar acción {index+1}</button></div>
        </li>)}
      </ol>
      <button type="button" disabled={workflow.actions.length>=5} onClick={()=>update({actions:[...workflow.actions,{type:'create_work_item',title:'',priority:'normal'}]})}>Añadir acción</button>
      <label className="p13-check"><input type="checkbox" name="enabled" checked={workflow.enabled} onChange={event=>update({enabled:event.target.checked})}/>Habilitar este workflow y autorizar sus acciones en el proyecto seleccionado</label>
      {preview?<section className="workflow-preview" aria-label="Vista previa del workflow"><h3>{workflow.name||'Workflow sin nombre'}</h3><p>{workflow.trigger_type==='manual'?'Al ejecutar manualmente':eventLabels[workflow.event_type??'']}{workflow.trigger_type==='domain_event'&&workflow.conditions.length?`, si se cumplen ${workflow.conditions.length} condiciones`:''}:</p><ol>{workflow.actions.map((action,index)=><li key={index}>{action.type==='create_work_item'?`Crear trabajo: ${action.title||'Título pendiente'}`:`Enviar webhook: ${connections.find(connection=>connection.id===action.connection_id)?.display_name??'Conexión pendiente'}`}</li>)}</ol><p>{valid?'Configuración completa.':'Configuración incompleta.'} {workflow.enabled?'Se habilitará al guardar.':'Permanecerá deshabilitado.'}</p></section>:null}
    </fieldset>
    {error?<p role="alert" className="p13-error">{error}</p>:null}
    <div className="p13-actions"><button className="crm-button" disabled={pending||submitting||!draft.ready}>{pending||submitting?'Guardando…':'Guardar workflow'}</button><button type="button" disabled={pending||submitting} onClick={()=>void draft.flush().then(saved=>{if(saved)onCancel()})}>Cerrar editor</button></div>
  </form>
}
