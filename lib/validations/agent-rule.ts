import { z } from 'zod'

export const createAgentRuleSchema = z.object({
  agentId: z.string().uuid(),
  trigger: z.string().min(1, 'Describe when this rule applies').max(500),
  action: z.string().min(1, 'Describe what the receptionist should do').max(500),
})
export type CreateAgentRuleInput = z.infer<typeof createAgentRuleSchema>

export const updateAgentRuleSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  trigger: z.string().min(1, 'Describe when this rule applies').max(500),
  action: z.string().min(1, 'Describe what the receptionist should do').max(500),
})
export type UpdateAgentRuleInput = z.infer<typeof updateAgentRuleSchema>

export const toggleAgentRuleSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  isEnabled: z.boolean(),
})
export type ToggleAgentRuleInput = z.infer<typeof toggleAgentRuleSchema>

export const deleteAgentRuleSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
})
export type DeleteAgentRuleInput = z.infer<typeof deleteAgentRuleSchema>
