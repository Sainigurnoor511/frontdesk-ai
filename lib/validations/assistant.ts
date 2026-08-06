import { z } from 'zod'

export const assistantChatIdSchema = z.object({
  chatId: z.string().uuid(),
})

export const assistantMessageSchema = z.object({
  chatId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
})

export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>
