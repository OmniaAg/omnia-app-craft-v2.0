import { describe, expect, it, vi } from 'vitest'
import { calendar } from '../features/editorial/api/editorial-service'
import type { OmniaSupabaseClient } from '../shared/api/supabase/client'

describe('editorial date-window query', () => {
  it('uses one filtered RPC for the visible month', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const client = { rpc } as unknown as OmniaSupabaseClient
    const result = await calendar(client, {
      from: '2030-10-01', to: '2030-10-31', projectId: 'project-a',
      state: 'available', channel: 'instagram',
    })
    expect(result).toEqual([])
    expect(rpc).toHaveBeenCalledExactlyOnceWith('editorial_calendar', {
      date_from: '2030-10-01', date_to: '2030-10-31',
      project_filter: 'project-a', state_filter: 'available', channel_filter: 'instagram',
    })
  })
})
