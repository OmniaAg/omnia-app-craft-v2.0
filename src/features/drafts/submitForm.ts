import type { FormEvent } from 'react'
import type { FieldValues, UseFormHandleSubmit } from 'react-hook-form'

export function submitForm<T extends FieldValues>(event: FormEvent<HTMLFormElement>, validate: UseFormHandleSubmit<T>, save: (values:T)=>Promise<unknown>) {
  const form=event.currentTarget
  const currentValues=()=>JSON.stringify([...form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input[name],select[name],textarea[name]')].map(field=>[field.name,field.value,'checked' in field?field.checked:null]))
  const snapshot=currentValues()
  void validate(async values=>{
    await save(values)
    if(currentValues()===snapshot)form.dispatchEvent(new Event('omnia:form-saved',{bubbles:true}))
  })(event).catch(()=>undefined)
}
