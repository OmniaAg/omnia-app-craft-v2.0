import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { crmKeys } from '../features/crm/api/queries'
import {
  contactFormSchema,
  opportunityFormSchema,
  organizationFormSchema,
} from '../features/crm/model/schemas'
import { OrganizationForm } from '../features/crm/ui/CrmForms'
import { CrmEmpty } from '../features/crm/ui/CrmUi'

describe('CRM contracts', () => {
  it('keeps page, search, lifecycle and sort scope in organization query keys', () => {
    const first = crmKeys.organizations({ page: 0, search: 'Yana', lifecycle: 'prospect' })
    const second = crmKeys.organizations({ page: 1, search: 'Yana', lifecycle: 'prospect' })
    expect(first).not.toEqual(second)
    expect(first).toEqual(['crm', 'organizations', { scope: 'authorized', sort: 'created_desc', page: 0, search: 'Yana', lifecycle: 'prospect' }])
  })

  it('validates organization domains and contact emails before commands', () => {
    expect(organizationFormSchema.safeParse({ name: 'YANA', domain: 'yana.com', timezone: 'America/Mexico_City', lifecycle: 'prospect' }).success).toBe(true)
    expect(organizationFormSchema.safeParse({ name: 'YANA', domain: 'not a domain', timezone: 'UTC', lifecycle: 'prospect' }).success).toBe(false)
    expect(contactFormSchema.safeParse({ fullName: 'Ada', email: 'invalid', phone: '', jobTitle: '', notes: '' }).success).toBe(false)
  })

  it('rejects negative opportunity values', () => {
    expect(opportunityFormSchema.safeParse({ name: 'Campaign', brandId: '', stageKey: 'lead', estimatedValue: '-1', currency: 'MXN', expectedCloseDate: '' }).success).toBe(false)
  })

  it('shows accessible inline errors and does not submit an invalid organization', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<OrganizationForm submitLabel="Crear organización" pending={false} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Escribe el nombre de la organización.')
    expect(screen.getByLabelText('Nombre').getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
  })

  it('uses an instructive empty state', () => {
    render(<CrmEmpty title="No hay oportunidades" description="Registra una oportunidad para comenzar el pipeline comercial." />)
    expect(screen.getByRole('heading', { name: 'No hay oportunidades' })).toBeTruthy()
    expect(screen.getByText(/comenzar el pipeline/i)).toBeTruthy()
  })
})
