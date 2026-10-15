import { useEffect } from 'react'
import { useDraftRegistry } from './draft-context'

export function UnmanagedFormGuard() {
  const register=useDraftRegistry()
  useEffect(()=>{
    const changed=new Set<HTMLFormElement>()
    const dirty=()=>{for(const form of changed)if(!form.isConnected)changed.delete(form);return changed.size>0}
    const record=(event:Event)=>{
      if(!/^\/(app|portal)(\/|$)/.test(location.pathname))return
      const field=event.target as HTMLInputElement
      const form=field.form
      if(form&&!form.hasAttribute('data-server-draft')&&!form.hasAttribute('data-managed-changes')&&(form.hasAttribute('data-track-changes')||!form.matches('.crm-filters,.analytics-filters,.files-search,[role="search"],[aria-label*="Filtros"]'))&&field.type!=='search')changed.add(form)
    }
    const reset=(event:Event)=>{if(event.target instanceof HTMLFormElement)changed.delete(event.target)}
    document.addEventListener('input',record,true);document.addEventListener('change',record,true);document.addEventListener('reset',reset,true);document.addEventListener('omnia:form-saved',reset,true)
    const unregister=register('unmanaged-forms',{dirty,flush:async()=>{
      if(!dirty())return true
      const discard=window.confirm('Hay cambios sin guardar en un formulario. ¿Salir y descartarlos?')
      return discard
    }})
    return()=>{unregister();document.removeEventListener('input',record,true);document.removeEventListener('change',record,true);document.removeEventListener('reset',reset,true);document.removeEventListener('omnia:form-saved',reset,true)}
  },[register])
  return null
}
