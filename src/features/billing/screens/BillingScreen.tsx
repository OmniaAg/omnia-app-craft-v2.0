import { useState } from 'react'
import { useAuth } from '../../auth/context/AuthContext'
import '../billing.css'
import {
  useBillingDocuments,
  useCreateBillingDocument,
  useIssueBillingDocument,
  usePublishBillingDocument,
  useRecordPayment
} from '../api'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function Component() {
  const auth = useAuth()
  const [page, setPage] = useState(0)
  const { data: documentPage, isLoading, error: listError } = useBillingDocuments(undefined, undefined, page)
  const documents = documentPage?.items
  
  const createMutation = useCreateBillingDocument()
  const issueMutation = useIssueBillingDocument()
  const publishMutation = usePublishBillingDocument()
  const recordPaymentMutation = useRecordPayment()

  const [showCreate, setShowCreate] = useState(false)

  const canCreate = auth.hasCapability('billing.create')

  // simple inline handlers for demo
  const handleIssue = (docId: string) => {
    if (confirm('Issue this document?')) {
      issueMutation.mutate({ documentId: docId, idempotencyKey: crypto.randomUUID() })
    }
  }

  const handlePublish = (docId: string) => {
    if (confirm('Publish this document?')) {
      publishMutation.mutate({ documentId: docId, idempotencyKey: crypto.randomUUID() })
    }
  }

  const handleRecordPayment = (docId: string) => {
    const amountStr = prompt('Amount:')
    if (!amountStr) return
    recordPaymentMutation.mutate({
      documentId: docId,
      amount: parseFloat(amountStr),
      method: 'transfer',
      receivedAt: new Date().toISOString(),
      idempotencyKey: crypto.randomUUID()
    })
  }

  return (
    <div className="billing-page">
      <div className="billing-header">
        <div>
          <h1 data-route-heading tabIndex={-1}>Billing Tracking</h1>
          <p className="text-muted-foreground">Operational invoices, quotes, and payment requests.</p>
        </div>
        {canCreate && (
          <button 
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Close Form' : 'Create Document'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="billing-editor">
          <h2 className="text-lg font-semibold mb-4">New Document (Draft)</h2>
          <form onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            createMutation.mutate({
              organization_id: fd.get('organization_id') as string,
              type: fd.get('type') as any,
              date: fd.get('date') as string,
              currency: fd.get('currency') as string,
              subtotal_amount: parseFloat(fd.get('subtotal') as string),
              tax_amount: parseFloat(fd.get('tax') as string),
              total_amount: parseFloat(fd.get('subtotal') as string) + parseFloat(fd.get('tax') as string),
              status: 'draft'
            }, {
              onSuccess: () => setShowCreate(false)
            })
          }} className="grid gap-4 max-w-sm">
            <label>Organization ID (UUID)<input name="organization_id" required className="border p-2 rounded w-full" /></label>
            <label>Tipo<select name="type" className="border p-2 rounded w-full">
              <option value="invoice_like">Invoice-like</option>
              <option value="quote">Quote</option>
              <option value="payment_request">Payment Request</option>
            </select></label>
            <label>Fecha<input name="date" type="date" required className="border p-2 rounded w-full" /></label>
            <label>Moneda<input name="currency" defaultValue="MXN" required className="border p-2 rounded w-full" /></label>
            <label>Subtotal<input name="subtotal" type="number" inputMode="decimal" step="0.01" required className="border p-2 rounded w-full" /></label>
            <label>Impuesto<input name="tax" type="number" inputMode="decimal" step="0.01" required className="border p-2 rounded w-full" /></label>
            <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded">
              Save Draft
            </button>
          </form>
          {createMutation.error ? <p role="alert">No pudimos guardar el documento. Comprueba la conexión y reintenta.</p> : null}
        </div>
      )}

      {isLoading ? <p>Loading documents...</p> : (
        <div className="billing-table-wrap" role="region" aria-label="Documentos de Billing, tabla desplazable" tabIndex={0}>
          <table className="billing-table" aria-label="Documentos de Billing">
            <thead className="bg-muted">
              <tr>
                <th className="p-3">Number</th>
                <th className="p-3">Client</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Total</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents?.map((doc: any) => (
                <tr key={doc.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">{doc.number || <span className="text-muted-foreground italic">Draft</span>}</td>
                  <td className="p-3">{doc.organizations?.name || doc.organization_id}</td>
                  <td className="p-3 capitalize">{doc.type.replace('_', ' ')}</td>
                  <td className="p-3 capitalize">
                    <span className="billing-status" data-status={doc.status}>
                      {doc.status.replace('_', ' ')}
                    </span>
                    {doc.published_at && <span className="billing-published">Published</span>}
                  </td>
                  <td className="p-3">{money.format(doc.total_amount)} {doc.currency}</td>
                  <td className="p-3 flex gap-2">
                    {doc.status === 'draft' && (
                      <button onClick={() => handleIssue(doc.id)} className="text-blue-600 hover:underline">Issue</button>
                    )}
                    {(doc.status === 'issued' || doc.status === 'partially_paid') && (
                      <>
                        <button onClick={() => handleRecordPayment(doc.id)} className="text-green-600 hover:underline">Pay</button>
                        {!doc.published_at && (
                          <button onClick={() => handlePublish(doc.id)} className="text-purple-600 hover:underline">Publish</button>
                        )}
                      </>
                    )}
                    {doc.status === 'paid' && (
                      <span className="text-gray-400">Done</span>
                    )}
                  </td>
                </tr>
              ))}
              {documents?.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No documents found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {listError ? <p role="alert">No pudimos cargar los documentos. Comprueba la conexión y reintenta.</p> : null}
      <nav aria-label="Páginas de documentos" className="billing-pagination">
        <button type="button" disabled={page === 0 || isLoading} onClick={() => setPage(value => value - 1)}>Anterior</button>
        <span>Página {page + 1}</span>
        <button type="button" disabled={!documentPage?.hasMore || isLoading} onClick={() => setPage(value => value + 1)}>Siguiente</button>
      </nav>
    </div>
  )
}
