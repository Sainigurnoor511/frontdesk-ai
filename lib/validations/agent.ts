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

export const updateAgentGeneralSchema = z.object({
  agentId: z.string().uuid(),
  voiceId: z.string().optional(),
  defaultLanguage: z.string().optional(),
  detectLanguage: z.boolean().optional(),
  additionalInstructions: z.string().max(8000).optional(),
  toneTraits: z.array(z.string()).optional(),
  firstMessage: z.string().optional(),
})
export type UpdateAgentGeneralInput = z.infer<typeof updateAgentGeneralSchema>

export const updateAgentCallSettingsSchema = z.object({
  agentId: z.string().uuid(),
  answeringMode: z.enum(['staff_first', 'agent_first']),
  staffPhoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number'),
  maxRingSeconds: z.number().int().min(5).max(60),
  holdMusic: z.string().optional(),
})
export type UpdateAgentCallSettingsInput = z.infer<typeof updateAgentCallSettingsSchema>

export const updateAgentAdvancedSettingsSchema = z.object({
  agentId: z.string().uuid(),
  // Which engine runs this agent's calls. `llmModel` and `reasoningEffort` below
  // only apply to 'livekit' — the 'assemblyai' provider uses AssemblyAI's own
  // managed conversational model. They stay required so the stored values
  // survive a round-trip through the form regardless of provider.
  voiceProvider: z.enum(['livekit', 'assemblyai']),
  llmModel: z.enum(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b']),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']),
  filterBackgroundSpeech: z.boolean(),
  skipKnowledgeRetrieval: z.boolean(),
  allowDtmf: z.boolean(),
  holdSound: z.enum(['default', 'office', 'soft_music', 'none']),
  typingSoundEnabled: z.boolean(),
  secureMode: z.boolean(),
  identityVerificationEnabled: z.boolean(),
})
export type UpdateAgentAdvancedSettingsInput = z.infer<typeof updateAgentAdvancedSettingsSchema>

export const renameAgentSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().min(1, 'Display name is required').max(200),
})
export type RenameAgentInput = z.infer<typeof renameAgentSchema>

export const duplicateAgentSchema = z.object({
  sourceAgentId: z.string().uuid(),
  name: z.string().min(1, 'Display name is required').max(200),
})
export type DuplicateAgentInput = z.infer<typeof duplicateAgentSchema>

export const setDefaultAgentSchema = z.object({
  agentId: z.string().uuid(),
})
export type SetDefaultAgentInput = z.infer<typeof setDefaultAgentSchema>

export const deleteAgentSchema = z.object({
  agentId: z.string().uuid(),
})
export type DeleteAgentInput = z.infer<typeof deleteAgentSchema>

export const getNewPhoneNumberSchema = z.object({
  agentId: z.string().uuid(),
  areaCode: z
    .string()
    .regex(/^\d{3}$/, 'Area code must be 3 digits')
    .optional()
    .or(z.literal('')),
})
export type GetNewPhoneNumberInput = z.infer<typeof getNewPhoneNumberSchema>

export const releasePhoneNumberSchema = z.object({
  agentId: z.string().uuid(),
  phoneNumberId: z.string().uuid(),
})
export type ReleasePhoneNumberInput = z.infer<typeof releasePhoneNumberSchema>

export const blockPhoneNumberSchema = z.object({
  agentId: z.string().uuid(),
  number: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number'),
})
export type BlockPhoneNumberInput = z.infer<typeof blockPhoneNumberSchema>

export const unblockPhoneNumberSchema = z.object({
  agentId: z.string().uuid(),
  blockedNumberId: z.string().uuid(),
})
export type UnblockPhoneNumberInput = z.infer<typeof unblockPhoneNumberSchema>

export const reassignPhoneNumberSchema = z.object({
  phoneNumberId: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
})
export type ReassignPhoneNumberInput = z.infer<typeof reassignPhoneNumberSchema>
