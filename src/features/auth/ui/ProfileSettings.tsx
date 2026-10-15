import {useState,type FormEvent} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useAuth} from '../context/AuthContext'
import {getSupabaseClient} from '../../../shared/api/supabase/client'
import '../../crm/ui/crm.css'

export function ProfileSettings(){
  const auth=useAuth(),cache=useQueryClient()
  const [name,setName]=useState(auth.actor?.profile?.display_name??'')
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget
    if(!auth.actor||!name.trim())return
    setPending(true);setError('');setSaved(false)
    try{
      const {data,error:failure}=await getSupabaseClient().from('profiles').update({display_name:name.trim()}).eq('user_id',auth.actor.user.id).select('user_id').single()
      if(failure||!data)throw new Error('profile_update_failed')
      await auth.refreshAuthorization();await cache.invalidateQueries();setSaved(true)
      form.dispatchEvent(new Event('omnia:form-saved',{bubbles:true}))
    }catch{setError('No pudimos guardar tu nombre. Se conserva aquí para reintentar.')}finally{setPending(false)}
  }
  return <section className="device-settings"><h2>Nombre de perfil</h2><p>El nombre con el que apareces en mensajes y revisiones.</p><form className="crm-form" onSubmit={event=>void submit(event)} style={{maxWidth:'38rem'}}>
    <label>Nombre para mostrar<input autoComplete="off" value={name} required maxLength={120} disabled={pending} onChange={event=>{setName(event.target.value);setSaved(false)}}/></label>
    <button type="submit" disabled={pending||!name.trim()} aria-busy={pending}>{pending?'Guardando…':'Guardar nombre'}</button>
    {error?<p role="alert">{error}</p>:null}{saved?<p role="status">Nombre guardado.</p>:null}
  </form></section>
}
