import { useState, type ComponentProps } from 'react'
import { useAuth } from '../auth/context/AuthContext'
import { ProjectForm } from '../projects/ui/ProjectForms'
import type { ProjectFormValues } from '../projects/model/schemas'
import { DraftStatus } from './DraftStatus'
import { useServerDraft } from './useServerDraft'

export function ProjectDraftForm({onCommitted,...props}:ComponentProps<typeof ProjectForm>&{onCommitted:()=>void}) {
  const brand=props.brands[0]
  const agency=useAuth().actor?.agencyMemberships.find(membership=>membership.status==='active')?.agency_id??''
  const [created,setCreated]=useState(false)
  const draft=useServerDraft<ProjectFormValues>('project',agency,'create',{brandId:brand?.brand_id??'',name:'',description:'',status:'planning',startDate:'',targetEndDate:'',timezone:brand?.timezone??'America/Mexico_City'})
  return <><DraftStatus draft={draft}/>{created?<><p role="status">Proyecto creado.</p><button type="button" onClick={()=>void draft.clear().then(cleared=>{if(cleared)onCommitted()})}>Abrir proyecto</button></>:draft.ready?<ProjectForm key={draft.restoreVersion} {...props} initialValues={draft.value} onDraftChange={draft.setValue} onSubmit={async value=>{if(!await draft.flush())throw new Error('draft_save_failed');await props.onSubmit(value);setCreated(true);if(await draft.clear())onCommitted()}}/>:null}</>
}
