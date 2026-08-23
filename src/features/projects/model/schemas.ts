import { z } from 'zod'

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().or(z.literal(''))

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida.').optional().or(z.literal(''))

export const projectStatusSchema = z.enum(['planning', 'active', 'on_hold', 'completed'])

export const projectFormSchema = z.object({
  brandId: z.string().uuid('Selecciona una marca.'),
  name: z.string().trim().min(1, 'Escribe el nombre del proyecto.').max(200),
  description: optionalText(8000),
  status: projectStatusSchema,
  startDate: optionalDate,
  targetEndDate: optionalDate,
  timezone: z.string().trim().min(1, 'Indica la zona horaria.').max(80),
}).superRefine((value, context) => {
  if (value.startDate && value.targetEndDate && value.targetEndDate < value.startDate) {
    context.addIssue({
      code: 'custom',
      path: ['targetEndDate'],
      message: 'La fecha objetivo debe ser igual o posterior al inicio.',
    })
  }
})

export const milestoneFormSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del hito.').max(160),
  description: optionalText(4000),
  dueDate: optionalDate,
  sortOrder: z.string().trim().regex(/^\d+$/, 'Usa un orden entero igual o mayor a cero.'),
})

export const projectMemberFormSchema = z.object({
  userId: z.string().uuid('Selecciona una persona.'),
})

export type ProjectFormValues = z.input<typeof projectFormSchema>
export type MilestoneFormValues = z.input<typeof milestoneFormSchema>
export type ProjectMemberFormValues = z.input<typeof projectMemberFormSchema>

export const PROJECT_PAGE_SIZE = 20
