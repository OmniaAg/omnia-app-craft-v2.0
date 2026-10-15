import type { ComponentProps } from 'react'
import { WorkItemForm } from '../work/ui/WorkForms'
import type { WorkItemFormValues } from '../work/model/schemas'
import { useServerDraft } from './useServerDraft'
import { DraftStatus } from './DraftStatus'
import { useDraftSubmission } from './useDraftSubmission'

export function WorkDraftForm({projectId,...props}:ComponentProps<typeof WorkItemForm>&{projectId:string}) {
  const draft=useServerDraft<WorkItemFormValues>('work',projectId,'create',{title:'',description:'',priority:'normal',dueLocal:'',milestoneId:'',assigneeIds:[]})
  const submission=useDraftSubmission(draft)
  return <><DraftStatus draft={draft}/>{submission.error?<p role="alert">{submission.error}</p>:null}{submission.committed?<button type="button" disabled={submission.pending} onClick={()=>void submission.submit(async()=>undefined,()=>undefined)}>Finalizar guardado</button>:draft.ready?<WorkItemForm key={draft.restoreVersion} {...props} pending={props.pending||submission.pending} initialValues={draft.value} onDraftChange={draft.setValue} onSubmit={async values=>{if(!await submission.submit(()=>props.onSubmit(values),()=>undefined))throw new Error('work_submission_incomplete')}}/>:null}</>
}
