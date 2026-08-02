import { z } from 'zod'

export const submitFeedbackSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    issue: z.string().max(2000).optional(),
    featureRequest: z.string().max(2000).optional(),
  })
  .refine(
    (data) => data.rating !== undefined || !!data.issue?.trim() || !!data.featureRequest?.trim(),
    { message: 'Add a rating, an issue, or a feature request before submitting.' }
  )
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>
