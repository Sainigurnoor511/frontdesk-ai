import { z } from 'zod'

export const messageIdSchema = z.object({
  id: z.string().uuid(),
})
export type MessageIdInput = z.infer<typeof messageIdSchema>

export const createContactFromMessageSchema = z.object({
  messageId: z.string().uuid(),
})
export type CreateContactFromMessageInput = z.infer<
  typeof createContactFromMessageSchema
>
