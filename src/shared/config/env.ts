import { z } from 'zod'

const publicEnvSchema = z.object({
  VITE_APP_URL: z.string().url().default('http://localhost:5173'),
})

type PublicEnvSource = Record<string, string | boolean | undefined>

export type PublicEnv = z.infer<typeof publicEnvSchema>

export function parsePublicEnv(source: PublicEnvSource): PublicEnv {
  return publicEnvSchema.parse(source)
}

export const env = parsePublicEnv(import.meta.env)
