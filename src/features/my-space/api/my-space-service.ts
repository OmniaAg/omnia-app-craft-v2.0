import type { OmniaSupabaseClient } from '../../../shared/api/supabase/client'
import type { Database } from '../../../shared/api/supabase/database.types'
import type { PersonalWorkFormValues } from '../model/schemas'

type MySpaceRow = Database['public']['Functions']['my_space_items']['Returns'][number]
export type MySpaceItem = MySpaceRow

export class MySpaceApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MySpaceApiError'
  }
}

function assertResult(error: { message: string } | null, fallback: string) {
  if (error) throw new MySpaceApiError(fallback)
}

const nullableString = (value?: string) => (value || null) as unknown as string

function localDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)).replace(' ', 'T')
}

export function personalFormValues(item: MySpaceItem): PersonalWorkFormValues {
  return {
    itemType: item.item_type as PersonalWorkFormValues['itemType'],
    title: item.title,
    description: item.description ?? '',
    priority: item.priority as PersonalWorkFormValues['priority'],
    dueLocal: item.due_at ? localDateTime(item.due_at) : '',
  }
}

export async function listMySpaceItems(client: OmniaSupabaseClient) {
  const { data, error } = await client.rpc('my_space_items')
  assertResult(error, 'No pudimos cargar tu espacio de trabajo.')
  return data ?? []
}

export async function createPersonalWorkItem(client: OmniaSupabaseClient, values: PersonalWorkFormValues) {
  const { data, error } = await client.rpc('create_personal_work_item', {
    item_type: values.itemType,
    title: values.title,
    description: values.description ?? '',
    priority: values.priority,
    due_local: nullableString(values.dueLocal),
  })
  assertResult(error, 'No pudimos crear el pendiente personal.')
  return data
}

export async function completePersonalWorkItem(client: OmniaSupabaseClient, item: MySpaceItem) {
  return updatePersonalWorkItem(client, item, personalFormValues(item), 'done')
}

export async function updatePersonalWorkItem(
  client: OmniaSupabaseClient,
  item: MySpaceItem,
  values: PersonalWorkFormValues,
  status: 'open' | 'done' = 'open',
) {
  const { data, error } = await client.rpc('update_personal_work_item', {
    personal_item_id: item.item_id,
    item_type: values.itemType,
    title: values.title,
    description: values.description ?? '',
    status,
    priority: values.priority,
    due_local: nullableString(values.dueLocal),
  })
  assertResult(error, status === 'done' ? 'No pudimos completar el elemento personal.' : 'No pudimos guardar el elemento personal.')
  return data
}

export async function archivePersonalWorkItem(client: OmniaSupabaseClient, itemId: string) {
  const { data, error } = await client.rpc('archive_personal_work_item', { personal_item_id: itemId })
  assertResult(error, 'No pudimos archivar el pendiente personal.')
  return data
}
