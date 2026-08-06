export const AGENT_LLM_MODELS = [
  {
    value: 'gemini-3-flash',
    label: 'Gemini 3 Flash',
    groqModel: 'llama-3.3-70b-versatile',
  },
  {
    value: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    groqModel: 'llama-3.3-70b-versatile',
  },
  {
    value: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    groqModel: 'openai/gpt-oss-120b',
  },
] as const

export type AgentLlmModel = (typeof AGENT_LLM_MODELS)[number]['value']

export const AGENT_REASONING_EFFORTS = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const

export type AgentReasoningEffort = (typeof AGENT_REASONING_EFFORTS)[number]['value']

export const AGENT_HOLD_SOUNDS = [
  { value: 'default', label: 'Default ambient' },
  { value: 'office', label: 'Office ambient' },
  { value: 'soft_music', label: 'Soft music' },
  { value: 'none', label: 'None' },
] as const

export type AgentHoldSound = (typeof AGENT_HOLD_SOUNDS)[number]['value']

export function resolveGroqModel(model: string): string {
  const match = AGENT_LLM_MODELS.find((entry) => entry.value === model)
  return match?.groqModel ?? 'llama-3.3-70b-versatile'
}
