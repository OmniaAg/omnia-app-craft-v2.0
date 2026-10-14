import { z } from 'zod'
import { draftSchema, SafeError, summarySchema } from './phase13-security.ts'

const contextSchema = z.object({
  project_name: z.string().max(120), open_work: z.number().int().nonnegative(), completed_work: z.number().int().nonnegative(),
  work_titles: z.array(z.string().max(160)).max(20),
}).strict()
export type AIContext = z.infer<typeof contextSchema>
export interface AIProvider {
  readonly provider: string
  readonly model: string
  generate(task: 'project_summary' | 'draft_work', context: AIContext, input: string, signal: AbortSignal): Promise<unknown>
}
export class LocalDeterministicProvider implements AIProvider {
  readonly provider = 'local_deterministic'
  readonly model = 'omnia-local-v1'
  async generate(task: 'project_summary' | 'draft_work', context: AIContext, input: string, signal: AbortSignal) {
    signal.throwIfAborted()
    if (task === 'project_summary') return {
      summary: `${context.project_name}: ${context.open_work} trabajos abiertos y ${context.completed_work} completados en tu alcance autorizado.`,
      open_work: context.open_work, completed_work: context.completed_work,
    }
    return { title: `Seguimiento de ${context.project_name}`.slice(0, 160), description: input.trim().slice(0, 2000) || 'Revisar pendientes y definir el siguiente paso con el equipo.', priority: 'normal' }
  }
}
export function configuredProvider(name: string | undefined): AIProvider {
  if (name !== 'local_deterministic') throw new SafeError('configuration_missing', 503)
  return new LocalDeterministicProvider()
}
export async function generateValidated(provider: AIProvider, task: 'project_summary' | 'draft_work', rawContext: unknown, input: string) {
  if (input.length > 2000) throw new SafeError('input_too_large', 413)
  const context = contextSchema.parse(rawContext)
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const raw = await Promise.race([
      provider.generate(task, context, input, controller.signal),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new SafeError('provider_unavailable', 503)) }, 8000) }),
    ])
    if (JSON.stringify(raw)?.length > 8192) throw new SafeError('invalid_result', 502)
    const parsed = (task === 'project_summary' ? summarySchema : draftSchema).safeParse(raw)
    if (!parsed.success) throw new SafeError('invalid_result', 502)
    return parsed.data
  } catch (error) {
    if (error instanceof SafeError) throw error
    throw new SafeError('provider_unavailable', 503)
  } finally { clearTimeout(timeout) }
}
