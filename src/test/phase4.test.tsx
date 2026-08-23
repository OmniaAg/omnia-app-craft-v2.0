import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../app/router/routes'
import { mySpaceKeys } from '../features/my-space/api/queries'
import { personalWorkFormSchema } from '../features/my-space/model/schemas'
import { PersonalWorkForm } from '../features/my-space/ui/PersonalWorkForm'
import { projectKeys } from '../features/projects/api/queries'
import { milestoneFormSchema, projectFormSchema } from '../features/projects/model/schemas'
import { workKeys } from '../features/work/api/queries'
import { assignmentFormSchema, commentFormSchema, workItemFormSchema } from '../features/work/model/schemas'

describe('Phase 4 frontend contracts', () => {
  it('keeps pagination and authorization scope in project query keys', () => {
    const first = projectKeys.list({ page: 0, search: 'A1', status: 'active' })
    const second = projectKeys.list({ page: 1, search: 'A1', status: 'active' })
    expect(first).not.toEqual(second)
    expect(first).toEqual(['projects', 'list', { scope: 'authorized', sort: 'created_desc', page: 0, search: 'A1', status: 'active' }])
  })

  it('separates project work, comments, events and My Space caches', () => {
    expect(workKeys.project('project-a')).not.toEqual(workKeys.comments('work-a'))
    expect(workKeys.comments('work-a')).not.toEqual(workKeys.events('work-a'))
    expect(mySpaceKeys.items()).toEqual(['my-space', 'items', { timezone: 'America/Mexico_City' }])
  })

  it('validates project chronology and milestone order', () => {
    expect(projectFormSchema.safeParse({ brandId: crypto.randomUUID(), name: 'Launch', description: '', status: 'planning', startDate: '2026-08-22', targetEndDate: '2026-08-21', timezone: 'America/Mexico_City' }).success).toBe(false)
    expect(milestoneFormSchema.safeParse({ name: 'Approval', description: '', dueDate: '', sortOrder: '-1' }).success).toBe(false)
  })

  it('validates work assignment and comments before commands', () => {
    expect(workItemFormSchema.safeParse({ title: 'Build', description: '', priority: 'urgent', dueLocal: '2026-08-22T10:30', milestoneId: '', assigneeIds: [] }).success).toBe(true)
    expect(assignmentFormSchema.safeParse({ assigneeIds: [] }).success).toBe(false)
    expect(commentFormSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it('keeps personal work separate from project identifiers', () => {
    const parsed = personalWorkFormSchema.parse({ itemType: 'reminder', title: 'Call client', description: '', priority: 'normal', dueLocal: '' })
    expect(parsed).not.toHaveProperty('projectId')
    expect(parsed).not.toHaveProperty('assigneeIds')
  })

  it('shows an accessible validation error for an empty personal item', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<PersonalWorkForm pending={false} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Crear elemento personal' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Escribe un título.')
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
  })

  it('edits an existing personal item through the shared validated form', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<PersonalWorkForm pending={false} submitLabel="Guardar cambios" initialValues={{ itemType: 'note', title: 'Contexto privado', description: 'Detalle', priority: 'high', dueLocal: '' }} onSubmit={onSubmit} />)
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Contexto privado')
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Contexto actualizado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contexto actualizado', itemType: 'note' })))
  })

  it('registers lazy routes for My Space and project detail', () => {
    const appRoute = appRoutes[0]?.children?.find((route) => route.element && route.children)?.children?.find((route) => route.path === 'app')
    const paths = appRoute?.children?.map((route) => route.path).filter(Boolean)
    expect(paths).toContain('my-space')
    expect(paths).toContain('projects')
    expect(paths).toContain('projects/:projectId')
  })
})
