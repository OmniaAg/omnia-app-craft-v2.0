import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { WorkItemForm } from '../features/work/ui/WorkForms'
import type { ProjectMember } from '../features/projects/api/project-service'

it('submits a selected PostgreSQL GUID assignee from the actual Work form',async()=>{
 const id='10000000-0000-0000-0000-000000000003',submit=vi.fn(async()=>undefined)
 const members=[{user_id:id,display_name:'Scoped PM',status:'active',member_type:'internal'},
  {user_id:'10000000-0000-0000-0000-000000000004',display_name:'Contributor',status:'active',member_type:'internal'}] as ProjectMember[]
 render(<WorkItemForm members={members} milestones={[]} pending={false} onSubmit={submit} />)
 fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Scoped Work'}})
 fireEvent.click(screen.getByLabelText('Scoped PM'))
 fireEvent.click(screen.getByRole('button',{name:'Crear trabajo'}))
 await waitFor(()=>expect(submit).toHaveBeenCalledWith(expect.objectContaining({title:'Scoped Work',assigneeIds:[id]})),{timeout:1000})
})
