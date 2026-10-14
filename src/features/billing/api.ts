import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from '../../shared/api/supabase/client'
import { useAuth } from '../auth/context/AuthContext'

export const BILLING_PAGE_SIZE = 25

export type BillingDocument = {
  id: string
  organization_id: string
  project_id: string | null
  type: 'invoice_like' | 'quote' | 'payment_request'
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'voided'
  number: string | null
  date: string
  currency: string
  subtotal_amount: number
  tax_amount: number
  total_amount: number
  notes: string | null
  created_at: string
  issued_at: string | null
  published_at: string | null
}

export function useBillingDocuments(organizationId?: string, projectId?: string, page = 0) {
  const actorId = useAuth().actor?.user.id
  return useQuery({
    queryKey: ['billing_documents', actorId, organizationId, projectId, page],
    enabled: Boolean(actorId),
    queryFn: async () => {
      const supabase = getSupabaseClient()
      let query = supabase.from('billing_documents').select(`
        *,
        organizations(name),
        projects(name)
      `).order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(page * BILLING_PAGE_SIZE, page * BILLING_PAGE_SIZE + BILLING_PAGE_SIZE)
      
      if (organizationId) query = query.eq('organization_id', organizationId)
      if (projectId) query = query.eq('project_id', projectId)
      
      const { data, error } = await query
      if (error) throw error
      return {items: data.slice(0, BILLING_PAGE_SIZE), hasMore: data.length > BILLING_PAGE_SIZE}
    }
  })
}

export function useCreateBillingDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<BillingDocument>) => {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.from('billing_documents').insert(input as any).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_documents'] })
    }
  })
}

export function useIssueBillingDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId, idempotencyKey }: { documentId: string, idempotencyKey: string }) => {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.rpc('issue_billing_document', {
        p_document_id: documentId,
        p_idempotency_key: idempotencyKey
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_documents'] })
    }
  })
}

export function usePublishBillingDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId, idempotencyKey }: { documentId: string, idempotencyKey: string }) => {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.rpc('publish_billing_document', {
        p_document_id: documentId,
        p_idempotency_key: idempotencyKey
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_documents'] })
    }
  })
}

export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { documentId: string, amount: number, method: string, receivedAt: string, reference?: string, notes?: string, idempotencyKey: string }) => {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.rpc('record_payment', {
        p_document_id: input.documentId,
        p_amount: input.amount,
        p_method: input.method as any,
        p_received_at: input.receivedAt,
        p_reference: input.reference || (null as any),
        p_notes: input.notes || (null as any),
        p_file_asset_id: null as any,
        p_idempotency_key: input.idempotencyKey
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_documents'] })
    }
  })
}

export function useVoidPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, reason, idempotencyKey }: { paymentId: string, reason: string, idempotencyKey: string }) => {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.rpc('void_payment', {
        p_payment_id: paymentId,
        p_reason: reason,
        p_idempotency_key: idempotencyKey
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_documents'] })
    }
  })
}
