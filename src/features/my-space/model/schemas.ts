import { z } from 'zod'
import { prioritySchema } from '../../work/model/schemas'

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().or(z.literal(''))

export const personalWorkFormSchema = z.object({
  itemType: z.enum(['todo', 'note', 'reminder']),
  title: z.string().trim().min(1, 'Escribe un título.').max(240),
  description: optionalText(8000),
  priority: prioritySchema,
  dueLocal: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Usa fecha y hora completas.')
    .optional()
    .or(z.literal('')),
})

export type PersonalWorkFormValues = z.input<typeof personalWorkFormSchema>
