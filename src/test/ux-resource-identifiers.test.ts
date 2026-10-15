import {expect,it} from 'vitest'
import {projectFormSchema,projectMemberFormSchema} from '../features/projects/model/schemas'

it('accepts PostgreSQL resource identifiers returned by authorized selectors',()=>{
  expect(projectMemberFormSchema.safeParse({userId:'10000000-0000-0000-0000-000000000004'}).success).toBe(true)
  expect(projectFormSchema.safeParse({brandId:'31000000-0000-0000-0000-0000000000a1',name:'Project',description:'',status:'planning',startDate:'',targetEndDate:'',timezone:'America/Mexico_City'}).success).toBe(true)
  expect(projectMemberFormSchema.safeParse({userId:'invalid-resource'}).success).toBe(false)
})
