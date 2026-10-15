import { useEffect } from 'react'
import { useDraftRegistry } from './draft-context'

export function useUnsavedChanges(id: string, dirty: boolean) {
  const register = useDraftRegistry()
  useEffect(() => register(id, {
    dirty: () => dirty,
    flush: async () => !dirty || window.confirm('Hay cambios sin guardar. ¿Salir y descartarlos?'),
  }), [dirty, id, register])
}
