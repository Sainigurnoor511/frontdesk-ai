import { z } from 'zod'

export const startDashboardCallSchema = z.object({
  agentId: z.string().uuid(),
})

export const startPublicCallSchema = z.object({
  organizationId: z.string().uuid(),
  agentId: z.string().uuid(),
  turnstileToken: z.string().optional(),
})

export const endCallSchema = z.object({
  roomName: z.string().min(1),
})

export type StartDashboardCallInput = z.infer<typeof startDashboardCallSchema>
export type StartPublicCallInput = z.infer<typeof startPublicCallSchema>
export type EndCallInput = z.infer<typeof endCallSchema>
