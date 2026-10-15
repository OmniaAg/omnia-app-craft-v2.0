import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { DraftContext,FlushContext,type DraftGuard } from './draft-context'
import { UnmanagedFormGuard } from './UnmanagedFormGuard'
import './drafts.css'

export function DraftProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<string, DraftGuard>())
  const register = useCallback((id: string, guard: DraftGuard) => {
    guards.current.set(id, guard)
    return () => { guards.current.delete(id) }
  }, [])
  const dirty = useCallback(() => [...guards.current.values()].some(guard => guard.dirty()), [])
  const flush = useCallback(async () => {
    for (const guard of guards.current.values()) if (guard.dirty() && !await guard.flush()) return false
    return true
  }, [])
  const blocker = useBlocker(dirty)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let active = true
    void flush().then(saved => {
      if (!active) return
      if (saved) blocker.proceed()
      else blocker.reset()
    })
    return () => { active = false }
  }, [blocker, flush])
  return <DraftContext.Provider value={register}><FlushContext.Provider value={flush}><UnmanagedFormGuard/>{children}</FlushContext.Provider></DraftContext.Provider>
}
