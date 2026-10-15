import {useRef,useState} from 'react'

export function useDraftSubmission(draft:{flush:()=>Promise<boolean>;clear:()=>Promise<boolean>}){
  const saved=useRef(false),running=useRef(false)
  const [pending,setPending]=useState(false),[committed,setCommitted]=useState(false),[error,setError]=useState('')
  async function submit(save:()=>Promise<unknown>,onComplete:()=>void){
    if(running.current)return false
    running.current=true;setPending(true);setError('')
    try{
      if(!saved.current){
        if(!await draft.flush())return false
        await save();saved.current=true;setCommitted(true)
      }
      if(await draft.clear()){saved.current=false;setCommitted(false);onComplete();return true}
      setError('El registro se guardó. Reintenta finalizar para retirar su borrador de recuperación.')
      return false
    }catch{setError('No pudimos guardar. Tu contenido permanece en el formulario.');return false}
    finally{running.current=false;setPending(false)}
  }
  return {submit,pending,committed,error}
}
