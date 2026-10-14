import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context/AuthContext'
import { projectOptionsQuery } from './api'

export function usePhase13Project(capability: 'automation.view' | 'integration.view') {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const actor = auth.actor?.user.id ?? ''
  const options = useQuery(projectOptionsQuery(actor, capability))
  const requested = params.get('project')
  const selected = options.data?.find(option => option.id === requested) ?? (requested ? undefined : options.data?.[0])
  return { actor, options, selected, project: selected?.id ?? '', select: (id: string) => setParams({ project: id }) }
}
