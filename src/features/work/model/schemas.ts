import { z } from 'zod'

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().or(z.literal(''))

const optionalLocalDateTime = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Usa fecha y hora completas.')
  .optional()
  .or(z.literal(''))

export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])

export const workItemFormSchema = z.object({
  title: z.string().trim().min(1, 'Escribe el título del trabajo.').max(240),
  description: optionalText(8000),
  priority: prioritySchema,
  dueLocal: optionalLocalDateTime,
  milestoneId: z.string().uuid().optional().or(z.literal('')),
  assigneeIds: z.array(z.string().uuid()).max(20, 'Selecciona como máximo 20 responsables.'),
})

export const assignmentFormSchema = z.object({
  assigneeIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos una persona.').max(20),
})

export const commentFormSchema = z.object({
  body: z.string().trim().min(1, 'Escribe un comentario.').max(8000),
})

export type WorkItemFormValues = z.input<typeof workItemFormSchema>
export type AssignmentFormValues = z.input<typeof assignmentFormSchema>
export type CommentFormValues = z.input<typeof commentFormSchema>
