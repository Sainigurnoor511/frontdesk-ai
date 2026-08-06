import { z } from 'zod'

export const scanDepthSchema = z.enum(['single', 'quick', 'deep'])

export const addKnowledgeWebsiteSchema = z.object({
  url: z.string().url('Enter a valid URL.'),
  name: z.string().trim().min(1, 'Name is required.').max(200),
  scanDepth: scanDepthSchema.default('quick'),
})

export const knowledgeSourceIdSchema = z.object({
  id: z.string().uuid(),
})

export const createFaqSchema = z.object({
  question: z.string().trim().min(1, 'Question is required.').max(500),
  answer: z.string().trim().min(1, 'Answer is required.').max(5000),
})

export const updateFaqSchema = createFaqSchema.extend({
  id: z.string().uuid(),
})

export const faqIdSchema = z.object({
  id: z.string().uuid(),
})

export type AddKnowledgeWebsiteInput = z.infer<typeof addKnowledgeWebsiteSchema>
export type CreateFaqInput = z.infer<typeof createFaqSchema>
export type UpdateFaqInput = z.infer<typeof updateFaqSchema>
