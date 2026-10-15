import { describe,expect,it } from 'vitest'
import { readDraft } from '../features/drafts/model'

describe('private draft recovery boundary',()=>{
  it('restores incomplete forms without mistaking them for saved domain records',()=>{
    expect(readDraft('work',{title:'',description:'',priority:'normal',dueLocal:'',milestoneId:'',assigneeIds:[]}).success).toBe(true)
  })
  it('rejects an invalid field type instead of feeding it to controlled inputs',()=>{
    expect(readDraft('message',{body:{html:'unexpected'}}).success).toBe(false)
  })
  it('rejects unknown fields and secret-bearing recovery payloads',()=>{
    expect(readDraft('message',{body:'text',password:'forbidden'}).success).toBe(false)
  })
  it('retains the message replay identifier across recovery without rejecting older drafts',()=>{
    const value={body:'QA message',clientMessageId:'10000000-0000-4000-8000-000000000001'}
    expect(readDraft('message',value).data).toEqual(value)
    expect(readDraft('message',{body:'Older draft'}).success).toBe(true)
    expect(readDraft('message',{body:'Invalid key',clientMessageId:'unexpected'}).success).toBe(false)
  })
  it('preserves incomplete action blocks while enforcing the engine step limit',()=>{
    const value={name:'',enabled:false,trigger_type:'manual',event_type:null,conditions:[],actions:[{type:'outbound_webhook',connection_id:''}]}
    expect(readDraft('automation',value).success).toBe(true)
    expect(readDraft('automation',{...value,actions:Array(6).fill(value.actions[0])}).success).toBe(false)
  })
})
