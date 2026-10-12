import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/conversations-service', () => ({
  createCallerMessageServiceRole: vi.fn(),
}))

vi.mock('@/lib/integrations/webhook', () => ({
  dispatchWebhook: vi.fn(),
}))

import { createCallerMessageServiceRole } from '@/lib/data/conversations-service'
import { dispatchWebhook } from '@/lib/integrations/webhook'
import { buildAssemblyAiTools } from '@/lib/voice/providers/assemblyai/session-config'
import { takeMessageSchema } from '@/lib/validations/caller-message'
import { buildEscalationToolHandlers } from './escalation-handlers'

const CONTEXT = {
  organizationId: 'org-1',
  agentId: 'agent-1',
  conversationId: 'conv-1',
}

function takeMessage(context = CONTEXT) {
  const handler = buildEscalationToolHandlers(context).find(
    (entry) => entry.name === 'take_message'
  )
  if (!handler) throw new Error('no such tool: take_message')
  return handler
}

/** Mirrors the pre-validation both providers perform before `execute` runs. */
function parse(args: unknown) {
  return takeMessageSchema.parse(args)
}

const ARGS = {
  callerName: 'Ada Lovelace',
  callbackNumber: '+1 555 123 4567',
  reason: 'She wants to discuss a bulk order and asked for the owner.',
  urgency: 'normal' as const,
}

describe('take_message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createCallerMessageServiceRole).mockResolvedValue({ id: 'msg-1' })
    vi.mocked(dispatchWebhook).mockResolvedValue()
  })

  it('persists the message against the call and dispatches the notification', async () => {
    const result = (await takeMessage().execute(parse(ARGS))) as {
      success: boolean
      messageId: string
      urgency: string
      spokenConfirmation: string
    }

    expect(createCallerMessageServiceRole).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conv-1',
      callerName: 'Ada Lovelace',
      callerPhone: '+1 555 123 4567',
      summary: 'She wants to discuss a bulk order and asked for the owner.',
      quotedLine: null,
      urgency: 'normal',
      source: 'agent_escalation',
    })
    expect(dispatchWebhook).toHaveBeenCalledWith('org-1', 'caller_message.created', {
      messageId: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      callerName: 'Ada Lovelace',
      callbackNumber: '+1 555 123 4567',
      reason: 'She wants to discuss a bulk order and asked for the owner.',
      urgency: 'normal',
    })
    expect(result.success).toBe(true)
    expect(result.messageId).toBe('msg-1')
  })

  it('returns a spoken confirmation naming the caller, the number, and the window', async () => {
    const result = (await takeMessage().execute(parse(ARGS))) as { spokenConfirmation: string }

    expect(result.spokenConfirmation).toContain('Ada Lovelace')
    expect(result.spokenConfirmation).toContain('+1 555 123 4567')
    expect(result.spokenConfirmation).toContain('next business day')
  })

  it('promises a sooner call back when the caller said it was urgent', async () => {
    const result = (await takeMessage().execute(
      parse({ ...ARGS, urgency: 'high' })
    )) as { spokenConfirmation: string; urgency: string }

    expect(result.urgency).toBe('high')
    expect(result.spokenConfirmation).toContain('today')
  })

  it('stores the quoted line when the model captured one', async () => {
    await takeMessage().execute(
      parse({ ...ARGS, quotedLine: 'Can I just talk to a human please?' })
    )

    expect(vi.mocked(createCallerMessageServiceRole).mock.calls[0][0].quotedLine).toBe(
      'Can I just talk to a human please?'
    )
  })

  // Org scoping. The tool has no organization argument at all, so the only way
  // a message can land in another org is if the handler read one from `args`.
  it('scopes the write to the context organization and exposes no org argument', async () => {
    await takeMessage({ ...CONTEXT, organizationId: 'org-2' }).execute(
      parse({
        ...ARGS,
        // Prompt-injected extras. `takeMessageSchema` strips unknown keys, and
        // the handler closes over the context org regardless.
        organizationId: 'org-evil',
        conversationId: 'conv-evil',
      } as Record<string, unknown>)
    )

    const written = vi.mocked(createCallerMessageServiceRole).mock.calls[0][0]
    expect(written.organizationId).toBe('org-2')
    expect(written.conversationId).toBe('conv-1')
    expect(Object.keys(takeMessage().parameters.shape)).not.toContain('organizationId')
    expect(Object.keys(takeMessage().parameters.shape)).not.toContain('conversationId')
  })

  // Long enough to clear the schema's string-length floor, but only four
  // dialable digits — the case the schema cannot express and `execute` must.
  it('rejects a callback number with too few digits before touching the database', async () => {
    const result = await takeMessage().execute(parse({ ...ARGS, callbackNumber: '+1 (555)' }))

    expect(result).toEqual({ error: 'invalid_callback_number' })
    expect(createCallerMessageServiceRole).not.toHaveBeenCalled()
    expect(dispatchWebhook).not.toHaveBeenCalled()
  })

  // 16 digits — one past the E.164 ceiling, which is what a transcription that
  // ran two numbers together looks like.
  it('rejects a callback number with more digits than any real number', async () => {
    const result = await takeMessage().execute(
      parse({ ...ARGS, callbackNumber: '+1 555 123 4567 89012' })
    )

    expect(result).toEqual({ error: 'invalid_callback_number' })
    expect(createCallerMessageServiceRole).not.toHaveBeenCalled()
  })

  it('returns an error result instead of throwing when the write fails', async () => {
    vi.mocked(createCallerMessageServiceRole).mockRejectedValue(new Error('db down'))

    const result = await takeMessage().execute(parse(ARGS))

    expect(result).toEqual({ error: 'message_failed' })
    expect(dispatchWebhook).not.toHaveBeenCalled()
  })

  // The message is already committed at this point, so a webhook that cannot be
  // enqueued must not turn into "sorry, I could not take your message".
  it('still confirms to the caller when the notification dispatch fails', async () => {
    vi.mocked(dispatchWebhook).mockRejectedValue(new Error('redis down'))

    const result = (await takeMessage().execute(parse(ARGS))) as {
      success: boolean
      messageId: string
    }

    expect(result.success).toBe(true)
    expect(result.messageId).toBe('msg-1')
  })

  it('keeps parameters a bare ZodObject, which both providers require', () => {
    expect(takeMessage().parameters).toBe(takeMessageSchema)
    expect(typeof takeMessage().parameters.shape).toBe('object')
  })

  // The failure the bare-ZodObject rule exists to prevent: `ZodEffects` (what a
  // `.refine()` produces) has no `.shape`, so `zodToJsonSchema` emits something
  // AssemblyAI rejects and `tool()` will not accept it either.
  it('converts to the JSON Schema the AssemblyAI session config sends', () => {
    const [serialized] = buildAssemblyAiTools([takeMessage()])

    expect(serialized.name).toBe('take_message')
    const parameters = serialized.parameters as {
      type: string
      required: string[]
      properties: Record<string, { enum?: string[] }>
    }
    expect(parameters.type).toBe('object')
    expect(parameters.required).toEqual(
      expect.arrayContaining(['callerName', 'callbackNumber', 'reason'])
    )
    expect(parameters.properties.urgency.enum).toEqual(['low', 'normal', 'high'])
    expect(parameters.properties).not.toHaveProperty('organizationId')
  })
})

describe('takeMessageSchema', () => {
  it('defaults urgency to normal when the model omits it', () => {
    expect(parse({ ...ARGS, urgency: undefined }).urgency).toBe('normal')
  })

  it('rejects an empty caller name', () => {
    const parsed = takeMessageSchema.safeParse({ ...ARGS, callerName: '   ' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].path).toEqual(['callerName'])
  })

  it('rejects an empty reason', () => {
    const parsed = takeMessageSchema.safeParse({ ...ARGS, reason: '' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].path).toEqual(['reason'])
  })

  it('rejects an urgency outside the stored check constraint', () => {
    expect(takeMessageSchema.safeParse({ ...ARGS, urgency: 'catastrophic' }).success).toBe(false)
  })

  it('rejects a callback number carrying anything but dialable characters', () => {
    const parsed = takeMessageSchema.safeParse({
      ...ARGS,
      callbackNumber: 'call me at reception',
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].path).toEqual(['callbackNumber'])
  })
})
