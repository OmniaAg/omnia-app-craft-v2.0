import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/context/AuthContext'
import { organizationsQuery } from '../../crm/api/queries'
import { getSupabaseClient } from '../../../shared/api/supabase/client'
import { useBillingDocuments,useCreateBillingDocument,useIssueBillingDocument,usePublishBillingDocument,useRecordPayment } from '../api'
import '../billing.css'
import { useFlushDrafts } from '../../drafts/draft-context'

const types:Record<string,string>={invoice_like:'Documento de cobro',quote:'Cotización',payment_request:'Solicitud de pago'}
const statuses:Record<string,string>={draft:'Borrador',issued:'Emitido',partially_paid:'Pago parcial',paid:'Pagado',voided:'Anulado'}
const money=(value:number,currency:string)=>new Intl.NumberFormat('es-MX',{style:'currency',currency}).format(value)

export function Component() {
  const auth=useAuth()
  const flushDrafts=useFlushDrafts()
  const createAttempt=useRef<{signature:string;key:string}|null>(null)
  const canFor=(key:string,organization:string,agency?:string)=>auth.hasCapability(key,organization)||Boolean(agency&&auth.hasCapability(key,agency))
  const [page,setPage]=useState(0)
  const documents=useBillingDocuments(undefined,undefined,page)
  const create=useCreateBillingDocument(),issue=useIssueBillingDocument(),publish=usePublishBillingDocument(),payment=useRecordPayment()
  const [showCreate,setShowCreate]=useState(false)
  const [search,setSearch]=useState(''),[organizationPage,setOrganizationPage]=useState(0)
  const [organizationId,setOrganizationId]=useState(''),[projectId,setProjectId]=useState('')
  const organizations=useQuery({...organizationsQuery({page:organizationPage,search,lifecycle:'all'}),enabled:showCreate})
  const projects=useQuery({queryKey:['billing-project-options',auth.actor?.user.id,organizationId],enabled:Boolean(showCreate&&organizationId),queryFn:async()=>{
    const {data,error}=await getSupabaseClient().from('projects').select('id,name,brands!inner(organization_id)').eq('brands.organization_id',organizationId).is('archived_at',null).order('name')
    if(error)throw error;return data
  }})
  const [paymentDocument,setPaymentDocument]=useState<{id:string;label:string;currency:string}|null>(null)
  const paymentKey=useRef<{key:string;receivedAt:string}|null>(null)
  const [success,setSuccess]=useState('')
  const [createdId,setCreatedId]=useState('')
  const busy=issue.isPending||publish.isPending||payment.isPending
  const commandError=issue.error??publish.error??payment.error
  const canCreate=auth.hasCapability('billing.create')
  if(!auth.hasCapability('billing.view'))return <div className="billing-page"><h1 data-route-heading tabIndex={-1}>Billing</h1><p>No tienes acceso a esta sección.</p></div>
  return <div className="billing-page">
    <header className="billing-header"><div><h1 data-route-heading tabIndex={-1}>Billing</h1><p>Documentos de cobro, cotizaciones y pagos registrados.</p></div>{canCreate?<button type="button" aria-expanded={showCreate} onClick={()=>void flushDrafts().then(saved=>{if(saved)setShowCreate(value=>!value)})}>{showCreate?'Cerrar formulario':'Nuevo documento'}</button>:null}</header>
    {success?<p role="status">{success}</p>:null}
    {commandError?<p role="alert">No pudimos completar la operación. Revisa el estado del documento y tus permisos antes de reintentar.</p>:null}
    {showCreate?<section className="billing-editor"><h2>Nuevo documento</h2>
      <div className="billing-client-search"><label>Buscar organización<input type="search" value={search} onChange={event=>{setSearch(event.target.value);setOrganizationPage(0)}}/></label>
        <div className="billing-pagination"><button type="button" disabled={!organizationPage} onClick={()=>setOrganizationPage(value=>value-1)}>Organizaciones anteriores</button><button type="button" disabled={!organizations.data||(organizationPage+1)*organizations.data.pageSize>=organizations.data.total} onClick={()=>setOrganizationPage(value=>value+1)}>Más organizaciones</button></div>
      </div>
      {organizations.error?<p role="alert">No pudimos cargar las organizaciones. <button type="button" onClick={()=>void organizations.refetch()}>Reintentar organizaciones</button></p>:null}
      <form onSubmit={event=>{
        event.preventDefault();const values=new FormData(event.currentTarget)
        const payload={organization_id:organizationId,project_id:projectId||null,type:values.get('type') as 'invoice_like'|'quote'|'payment_request',date:values.get('date') as string,currency:values.get('currency') as string,concept:String(values.get('concept')??'').trim(),subtotal_amount:Number(values.get('subtotal')),tax_amount:Number(values.get('tax'))}
        const signature=JSON.stringify(payload)
        if(createAttempt.current?.signature!==signature)createAttempt.current={signature,key:crypto.randomUUID()}
        create.mutate({...payload,idempotencyKey:createAttempt.current.key},{onSuccess:id=>{createAttempt.current=null;setCreatedId(id??'');setPage(0);setShowCreate(false);setSuccess('Borrador de documento guardado.')}})
      }}><fieldset className="form-fields" disabled={create.isPending}>
        <label>Organización<select name="organization_id" required value={organizationId} onChange={event=>{setOrganizationId(event.target.value);setProjectId('')}}><option value="">{organizations.isPending?'Cargando organizaciones…':'Selecciona organización'}</option>{organizationId&&!organizations.data?.items.some(item=>item.id===organizationId)?<option value={organizationId}>Organización seleccionada</option>:null}{organizations.data?.items.filter(item=>canFor('billing.create',item.id,item.agency_id)).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Proyecto, opcional<select name="project_id" value={projectId} onChange={event=>setProjectId(event.target.value)} disabled={!organizationId||projects.isPending}><option value="">Documento de la organización</option>{projects.data?.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        {projects.error?<p role="alert">No pudimos cargar los proyectos de esta organización.</p>:null}
        <label>Tipo<select name="type">{Object.entries(types).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Fecha<input name="date" type="date" required/></label>
        <label>Moneda<input name="currency" defaultValue="MXN" required pattern="[A-Z]{3}" maxLength={3}/></label>
        <label>Concepto del documento<input name="concept" required maxLength={1000}/><small>Un concepto con cantidad 1; el subtotal corresponde a su importe.</small></label>
        <label>Subtotal<input name="subtotal" type="number" inputMode="decimal" min="0" step="0.01" required/></label>
        <label>Impuesto<input name="tax" type="number" inputMode="decimal" min="0" step="0.01" required/></label>
        <button type="submit" disabled={create.isPending||!organizationId}>{create.isPending?'Guardando…':'Guardar borrador'}</button>
      </fieldset></form>{create.error?<p role="alert">No pudimos guardar el documento. Tus datos permanecen en el formulario; comprueba la conexión y reintenta.</p>:null}
    </section>:null}
    {paymentDocument?<section className="billing-editor" aria-label="Registrar pago"><h2>Registrar pago de {paymentDocument.label}</h2><p>El importe en {paymentDocument.currency} debe ser mayor que cero y no exceder el saldo pendiente. Método: transferencia.</p><form onSubmit={event=>{
      event.preventDefault();const values=new FormData(event.currentTarget);paymentKey.current??={key:crypto.randomUUID(),receivedAt:new Date().toISOString()}
      payment.mutate({documentId:paymentDocument.id,amount:Number(values.get('amount')),method:'transfer',receivedAt:paymentKey.current.receivedAt,idempotencyKey:paymentKey.current.key},{onSuccess:()=>{setPaymentDocument(null);paymentKey.current=null;setSuccess('Pago registrado.')}})
    }}><fieldset className="form-fields" disabled={payment.isPending}><label>Importe ({paymentDocument.currency})<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required onChange={()=>{paymentKey.current=null}}/></label><div className="billing-pagination"><button disabled={payment.isPending}>{payment.isPending?'Registrando…':'Registrar pago'}</button><button type="button" disabled={payment.isPending} onClick={()=>setPaymentDocument(null)}>Cancelar pago</button></div></fieldset></form></section>:null}
    {documents.isLoading?<p role="status">Cargando documentos…</p>:<div className="billing-table-wrap" role="region" aria-label="Documentos de Billing, tabla desplazable" tabIndex={0}><table className="billing-table" aria-label="Documentos de Billing"><thead><tr><th>Número y conceptos</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{documents.data?.items.map(document=><tr key={document.id} data-document-id={document.id} data-created={createdId===document.id}>
      <td>{document.number||'Borrador'}{createdId===document.id?<span className="billing-published">Creado en esta sesión</span>:null}<span className="billing-published">Fecha: {document.date}</span>{document.billing_document_items.length?<details className="billing-concepts"><summary>{document.billing_document_items[0].description.slice(0,65)}{document.billing_document_items[0].description.length>65?'…':''}</summary><ul>{[...document.billing_document_items].sort((a,b)=>a.sort_order-b.sort_order).map(item=><li key={item.id}>{item.description} · {item.quantity} × {money(item.unit_price,document.currency)} = {money(item.line_total,document.currency)}</li>)}</ul></details>:null}</td><td>{document.organizations?.name||document.organization_id}</td><td>{types[document.type]}</td><td><span className="billing-status" data-status={document.status}>{statuses[document.status]}</span>{document.published_at?<span className="billing-published">Publicado</span>:null}</td><td>{money(document.total_amount,document.currency)}</td>
      <td><div className="billing-pagination">{document.status==='draft'&&canFor('billing.issue',document.organization_id,document.organizations?.agency_id)?<button disabled={busy} type="button" onClick={()=>{if(window.confirm('¿Emitir este documento? Sus importes quedarán fijados.'))issue.mutate({documentId:document.id,idempotencyKey:crypto.randomUUID()},{onSuccess:()=>setSuccess('Documento emitido.')})}}>Emitir</button>:null}
        {['issued','partially_paid'].includes(document.status)?<>{canFor('billing.record_payment',document.organization_id,document.organizations?.agency_id)?<button disabled={busy} type="button" onClick={()=>{setPaymentDocument({id:document.id,label:document.number??'Documento',currency:document.currency});paymentKey.current=null}}>Registrar pago</button>:null}{!document.published_at&&canFor('billing.publish',document.organization_id,document.organizations?.agency_id)?<button disabled={busy} type="button" onClick={()=>{if(window.confirm('¿Publicar este documento para el cliente?'))publish.mutate({documentId:document.id,idempotencyKey:crypto.randomUUID()},{onSuccess:()=>setSuccess('Documento publicado al cliente.')})}}>Publicar</button>:null}</>:null}{document.status==='paid'?<span>Pagado</span>:null}</div></td>
    </tr>)}{documents.data?.items.length===0?<tr><td colSpan={6}>No hay documentos en este alcance.</td></tr>:null}</tbody></table></div>}
    {documents.error?<p role="alert">No pudimos cargar los documentos. <button type="button" onClick={()=>void documents.refetch()}>Reintentar documentos</button></p>:null}
    <nav aria-label="Páginas de documentos" className="billing-pagination"><button type="button" disabled={!page||documents.isLoading} onClick={()=>setPage(value=>value-1)}>Anterior</button><span>Página {page+1}</span><button type="button" disabled={!documents.data?.hasMore||documents.isLoading} onClick={()=>setPage(value=>value+1)}>Siguiente</button></nav>
  </div>
}
