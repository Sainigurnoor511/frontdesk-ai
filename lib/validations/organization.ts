import { z } from 'zod'

export const organizationNameSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200),
})

export type OrganizationNameInput = z.infer<typeof organizationNameSchema>
