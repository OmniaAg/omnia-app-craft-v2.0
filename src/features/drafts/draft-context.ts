import { createContext, useContext } from 'react'

export type DraftGuard = { dirty: () => boolean; flush: () => Promise<boolean> }
export const DraftContext = createContext<(id:string,guard:DraftGuard)=>()=>void>(()=>()=>undefined)
export const FlushContext = createContext<()=>Promise<boolean>>(async()=>true)
export const useDraftRegistry = () => useContext(DraftContext)
export const useFlushDrafts = () => useContext(FlushContext)
