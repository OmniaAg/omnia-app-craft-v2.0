import { z } from 'zod'

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().or(z.literal(''))

export const organizationLifecycleSchema = z.enum([
  'prospect',
  'active_client',
  'inactive',
  'archived',
])

export const organizationFormSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la organización.').max(200),
  domain: optionalText(253).refine(
    (value) =>
      !value ||
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value),
    'Usa un dominio como empresa.com.',
  ),
  timezone: z.string().trim().min(1).max(80).default('America/Mexico_City'),
  lifecycle: organizationLifecycleSchema.exclude(['archived']).default('prospect'),
})

export const brandFormSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la marca.').max(160),
  timezone: optionalText(80),
})

export const contactFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Escribe el nombre del contacto.').max(160),
  email: z.string().trim().email('Escribe un correo válido.').max(320).optional().or(z.literal('')),
  phone: optionalText(40),
  jobTitle: optionalText(120),
  notes: optionalText(4000),
})

export const opportunityFormSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la oportunidad.').max(200),
  brandId: z.string().uuid().optional().or(z.literal('')),
  stageKey: z.string().trim().min(1),
  estimatedValue: z
    .string()
    .trim()
    .refine((value) => !value || (!Number.isNaN(Number(value)) && Number(value) >= 0), 'Usa un monto igual o mayor a cero.'),
  currency: z.string().trim().length(3, 'Usa un código ISO de tres letras.').transform((value) => value.toUpperCase()),
  expectedCloseDate: z.string().optional().or(z.literal('')),
})

export const activityFormSchema = z.object({
  activityType: z.enum(['note', 'call', 'meeting', 'email_reference']),
  summary: z.string().trim().min(1, 'Resume la actividad.').max(240),
  details: optionalText(8000),
})

export type OrganizationFormValues = z.input<typeof organizationFormSchema>
export type BrandFormValues = z.input<typeof brandFormSchema>
export type ContactFormValues = z.input<typeof contactFormSchema>
export type OpportunityFormValues = z.input<typeof opportunityFormSchema>
export type ActivityFormValues = z.input<typeof activityFormSchema>

export const PAGE_SIZE = 20

