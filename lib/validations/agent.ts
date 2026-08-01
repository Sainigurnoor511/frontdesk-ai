import { z } from 'zod'

export const scanRequestSchema = z.object({
  url: z.string().url('Enter a valid URL'),
  scanDepth: z.enum(['single', 'quick', 'deep']),
})
export type ScanRequestInput = z.infer<typeof scanRequestSchema>

export const manualBusinessInfoSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(200),
})
export type ManualBusinessInfoInput = z.infer<typeof manualBusinessInfoSchema>

export const countryLanguageSchema = z.object({
  country: z.string().min(1, 'Select a country'),
  language: z.string().min(1, 'Select a language'),
})
export type CountryLanguageInput = z.infer<typeof countryLanguageSchema>

export const industrySchema = z.object({
  industry: z.string().min(1, 'Select an industry'),
})
export type IndustryInput = z.infer<typeof industrySchema>

export const callRoutingSchema = z.object({
  answeringMode: z.enum(['staff_first', 'agent_first']),
  staffPhoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number'),
  maxRingSeconds: z.number().int().min(5).max(60),
  holdMusic: z.string().optional(),
})
export type CallRoutingInput = z.infer<typeof callRoutingSchema>

export const createAgentSchema = z.object({
  businessName: z.string().min(1).max(200),
  country: z.string().min(1),
  language: z.string().min(1),
  industry: z.string().min(1),
  answeringMode: z.enum(['staff_first', 'agent_first']),
  staffPhoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/),
  maxRingSeconds: z.number().int().min(5).max(60),
  holdMusic: z.string().optional(),
  greetingPrompt: z.string().optional(),
  personalityNotes: z.string().optional(),
})
export type CreateAgentInput = z.infer<typeof createAgentSchema>
