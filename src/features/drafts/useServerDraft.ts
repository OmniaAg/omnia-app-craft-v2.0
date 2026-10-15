import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { useAuth } from '../auth/context/AuthContext'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import type { Json } from '../../shared/api/supabase/database.types'
import { useDraftRegistry } from './draft-context'
import { readDraft } from './model'

export type DraftKind = 'work' | 'editorial' | 'automation' | 'message' | 'project'
type DraftStatus = 'loading' | 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'invalid'

export function useServerDraft<T extends object>(kind: DraftKind, scope: string, key: string, initial: T) {
  const owner = useAuth().actor?.user.id ?? ''
  const register = useDraftRegistry()
  const [value, setValueState] = useState(initial)
  const [status, setStatus] = useState<DraftStatus>('loading')
  const [ready, setReady] = useState(false)
  const [restoreVersion,setRestoreVersion] = useState(0)
  const identity=`${owner}:${kind}:${scope}:${key}`
  const state = useRef({ value, initial, revision: 0, dirty: false, change: 0, blocked: false, invalid:false, ready: false, clearRequested:false, identity })
  const inFlight = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true)
  const lifetime = useRef(0)
  const initialValue = useRef(initial)
  useEffect(()=>{initialValue.current=initial})
  const client = getSupabaseClient()
  const setValue = useCallback((next: SetStateAction<T>) => {
    const updated = typeof next === 'function' ? next(state.current.value) : next
    state.current.value = updated
    state.current.clearRequested=false
    state.current.change += 1
    state.current.dirty = true
    setValueState(updated)
    setStatus(state.current.invalid ? 'invalid' : state.current.blocked ? 'conflict' : 'dirty')
  }, [])

  const load = useCallback(async () => {
    const generation = lifetime.current
    if (!owner || !scope) { state.current.ready = false; if (mounted.current) { setReady(false); setStatus('idle') }; return }
    const change = state.current.change
    const {data, error} = await client.from('user_drafts').select('body,revision').eq('owner_id',owner).eq('kind',kind).eq('scope_id',scope).eq('draft_key',key).maybeSingle()
    if (!mounted.current || generation !== lifetime.current) return
    if (error) { setStatus('error'); return }
    if (change !== state.current.change) { state.current.blocked = true; setStatus('conflict'); return }
    const populated=data&&Object.keys(data.body as object).length>0
    const parsed=populated?readDraft(kind,data.body):null
    state.current.revision=data?.revision??0
    if(parsed&&!parsed.success){state.current.blocked=true;state.current.invalid=true;state.current.ready=true;setReady(true);setStatus('invalid');return}
    const restored = parsed?.success ? parsed.data as T : state.current.initial
    state.current.value = restored
    state.current.revision = data?.revision ?? 0
    state.current.blocked = false
    state.current.invalid = false
    state.current.dirty = false
    state.current.clearRequested=false
    state.current.ready = true
    setValueState(restored); setRestoreVersion(version=>version+1);setReady(true); setStatus(data && Object.keys(data.body as object).length ? 'saved' : 'idle')
  }, [client, key, kind, owner, scope])

  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current
    if (!state.current.dirty) return true
    if (!state.current.ready || state.current.blocked || state.current.identity!==identity || (!mounted.current&&!state.current.clearRequested)) return false
    const operation = async () => {
      const generation = lifetime.current
      const changed = state.current.change
      const clearing=state.current.clearRequested
      setStatus('saving')
      const args={p_owner:owner,p_kind:kind,p_scope:scope,p_key:key,p_revision:state.current.revision}
      const {data, error} = clearing ? await client.rpc('clear_user_draft',args) : await client.rpc('save_user_draft', {...args,p_body:state.current.value as Json})
      if (!mounted.current || generation !== lifetime.current) return false
      if (error || !data) {
        state.current.blocked = error?.code === '40001'
        setStatus(state.current.blocked ? 'conflict' : 'error')
        return false
      }
      state.current.revision = data.revision
      state.current.dirty = changed !== state.current.change
      if(clearing&&!state.current.dirty){
        state.current.value=state.current.initial;state.current.clearRequested=false;state.current.invalid=false
        setValueState(state.current.initial);setRestoreVersion(version=>version+1);setStatus('idle')
      }else setStatus(state.current.dirty ? 'dirty' : 'saved')
      return !state.current.dirty
    }
    inFlight.current = operation()
    try { return await inFlight.current } finally { inFlight.current = null }
  }, [client, identity, key, kind, owner, scope])

  const clear = useCallback(async () => {
    if (inFlight.current) await inFlight.current
    if(state.current.identity!==identity)return false
    state.current.clearRequested=true;state.current.dirty=true;state.current.blocked=false
    return flush()
  }, [flush,identity])

  useEffect(() => {
    mounted.current = true
    lifetime.current += 1
    state.current.initial = initialValue.current
    state.current.value = state.current.initial; state.current.revision = 0; state.current.dirty = false; state.current.ready = false;state.current.clearRequested=false;state.current.identity=identity
    setValueState(state.current.initial);setReady(false);setStatus('loading')
    void load()
    return () => { mounted.current = false; lifetime.current += 1 }
  }, [identity,load])
  useEffect(() => register(`${owner}:${kind}:${scope}:${key}`, {dirty:()=>state.current.dirty,flush}), [flush,key,kind,owner,register,scope])
  useEffect(() => {
    if (!ready || !state.current.dirty || state.current.blocked) return
    const timer = window.setTimeout(() => { void flush() }, 600)
    return () => window.clearTimeout(timer)
  }, [flush,ready,value])

  return {value,setValue,status,ready,restoreVersion,flush,clear,reload:load}
}
