import { z } from 'zod'

const text=z.string().max(16000)
const priority=z.enum(['low','normal','high','urgent'])
const piece=z.object({title:text,brief:text,date:text,time:text,channel:text,format:text,cycleId:text,templateId:text}).strict()
const template=z.object({name:text,channel:text,format:text,brief:text}).strict()
const cycle=z.object({name:text,from:text,to:text,status:text}).strict()
const schemas={
  work:z.object({title:text,description:text,priority,dueLocal:text,milestoneId:text,assigneeIds:z.array(z.string()).max(100)}).strict(),
  project:z.object({brandId:text,name:text,description:text,status:text,startDate:text,targetEndDate:text,timezone:text}).strict(),
  message:z.object({body:z.string().max(4000),clientMessageId:z.guid().or(z.literal('')).optional()}).strict(),
  editorial:z.union([piece,template,cycle]),
  automation:z.object({name:text,enabled:z.boolean(),trigger_type:z.enum(['manual','domain_event']),event_type:text.nullable(),conditions:z.array(z.object({field:z.enum(['event_type','project_id','resource_type','status']),operator:z.enum(['equals','contains','exists']),value:text.optional()}).strict()).max(5),actions:z.array(z.discriminatedUnion('type',[
    z.object({type:z.literal('create_work_item'),title:text,priority}).strict(),
    z.object({type:z.literal('outbound_webhook'),connection_id:text}).strict(),
  ])).min(1).max(5)}).strict(),
}
export const readDraft=(kind:keyof typeof schemas,value:unknown)=>schemas[kind].safeParse(value)
