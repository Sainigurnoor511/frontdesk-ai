import { z } from 'zod'

export const enableIntegrationSchema = z.object({
  integrationSlug: z.string().min(1, 'Integration is required'),
})
export type EnableIntegrationInput = z.infer<typeof enableIntegrationSchema>
