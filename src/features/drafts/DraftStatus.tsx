import './drafts.css'

export function DraftStatus({ draft }: { draft: { status: string; ready: boolean; flush: () => Promise<boolean>; reload: () => Promise<void>; clear:()=>Promise<boolean> } }) {
  const labels: Record<string,string> = {loading:'Cargando borrador…',idle:'El borrador se conserva en tu cuenta durante 30 días.',dirty:'Cambios sin guardar',saving:'Guardando borrador…',saved:'Borrador guardado',error:'No pudimos guardar el borrador. Tu contenido permanece aquí. Reintenta antes de salir.',conflict:'Otra pestaña cambió este borrador. Tu contenido local permanece aquí; copia lo que necesites antes de cargar la versión del servidor.'}
  return <div className="draft-status" role={['error','conflict','invalid'].includes(draft.status)?'alert':'status'}>
    <span>{labels[draft.status]}</span>
    {draft.status==='error'?<button type="button" onClick={()=>void (draft.ready?draft.flush():draft.reload())}>Reintentar borrador</button>:null}
    {draft.status==='conflict'?<button type="button" onClick={()=>{if(window.confirm('¿Cargar el borrador del servidor y reemplazar el contenido local de este formulario?'))void draft.reload()}}>Cargar borrador del servidor</button>:null}
    {draft.status==='invalid'?<><span>El borrador tiene un formato incompatible. Se conserva en tu cuenta hasta que decidas descartarlo.</span><button type="button" onClick={()=>{if(window.confirm('¿Descartar este borrador incompatible?'))void draft.clear()}}>Descartar borrador incompatible</button></>:null}
    {['dirty','saved','error'].includes(draft.status)&&draft.ready?<button type="button" onClick={()=>{if(window.confirm('¿Descartar este borrador y volver a los valores iniciales?'))void draft.clear()}}>Descartar borrador</button>:null}
  </div>
}
