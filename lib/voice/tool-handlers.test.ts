import { describe, it, expect, vi } from 'vitest'

// Keeps `cheerio` and the crawler out of this suite's module graph (they are
// static imports of `knowledge-service`), not because they are a load-time
// hazard — `fastembed`, `pdf-parse`, and `mammoth` are all dynamic imports.
vi.mock('@/lib/data/knowledge-service', () => ({
  searchKnowledgeServiceRole: vi.fn(),
}))

import {
  buildVoiceToolHandlers,
  executeVoiceToolHandler,
  manageBookingToolsAllowed,
} from './tool-handlers'

const CONTEXT = {
  organizationId: 'org-1',
  agentId: 'agent-1',
  conversationId: 'conv-1',
}

describe('buildVoiceToolHandlers', () => {
  it('exposes every tool, including cancel and reschedule, with no flags set', () => {
    expect(buildVoiceToolHandlers(CONTEXT).map((handler) => handler.name)).toEqual([
      'check_availability',
      'book_appointment',
      'find_appointment',
      'cancel_appointment',
      'reschedule_appointment',
      'search_knowledge',
      'take_message',
    ])
  })

  it('drops only search_knowledge when the agent skips knowledge retrieval', () => {
    const names = buildVoiceToolHandlers({ ...CONTEXT, skipKnowledgeRetrieval: true }).map(
      (handler) => handler.name
    )

    expect(names).not.toContain('search_knowledge')
    expect(names).toContain('cancel_appointment')
    expect(names).toContain('reschedule_appointment')
    expect(names).toContain('take_message')
  })

  // The security gate. Email is the only caller credential these three tools
  // have, so an org that turned on secure mode must not get an agent that reads
  // appointment titles and times back to anyone who can say a client's address.
  it('withholds every manage-booking tool from a secure-mode agent', () => {
    const names = buildVoiceToolHandlers({ ...CONTEXT, secureMode: true }).map(
      (handler) => handler.name
    )

    expect(names).not.toContain('find_appointment')
    expect(names).not.toContain('cancel_appointment')
    expect(names).not.toContain('reschedule_appointment')
    // Booking a new appointment discloses nothing about an existing client, so
    // it stays. `take_message` stays for the same reason, and because the
    // secure-mode prompt tells the agent to offer exactly that instead.
    expect(names).toEqual([
      'check_availability',
      'book_appointment',
      'search_knowledge',
      'take_message',
    ])
  })

  it('withholds them for identity verification alone, which is a separate toggle', () => {
    const names = buildVoiceToolHandlers({
      ...CONTEXT,
      identityVerificationEnabled: true,
    }).map((handler) => handler.name)

    expect(names).not.toContain('find_appointment')
    expect(names).not.toContain('cancel_appointment')
    expect(names).not.toContain('reschedule_appointment')
  })

  it('reports the gate directly, so the prompt builder and the tool list agree', () => {
    expect(manageBookingToolsAllowed(CONTEXT)).toBe(true)
    expect(manageBookingToolsAllowed({ ...CONTEXT, secureMode: true })).toBe(false)
    expect(manageBookingToolsAllowed({ ...CONTEXT, identityVerificationEnabled: true })).toBe(
      false
    )
  })

  it('lets no tool select an organization', () => {
    for (const handler of buildVoiceToolHandlers(CONTEXT)) {
      expect(Object.keys(handler.parameters.shape)).not.toContain('organizationId')
    }
  })
})

describe('executeVoiceToolHandler', () => {
  it('rejects a malformed email before any data access', async () => {
    const result = (await executeVoiceToolHandler(CONTEXT, 'cancel_appointment', {
      clientEmail: 'not-an-email',
      startsAt: '2026-08-05T14:00:00Z',
    })) as { error: string; details: string }

    expect(result.error).toBe('invalid_arguments')
    expect(result.details).toContain('clientEmail')
  })

  it('rejects a naive datetime with no offset', async () => {
    const result = (await executeVoiceToolHandler(CONTEXT, 'reschedule_appointment', {
      clientEmail: 'ada@example.com',
      startsAt: '2026-08-05T14:00:00',
      newStartsAt: '2026-08-06T09:00:00Z',
    })) as { error: string; details: string }

    expect(result.error).toBe('invalid_arguments')
    expect(result.details).toContain('startsAt')
  })

  it('rejects a missing required argument', async () => {
    const result = (await executeVoiceToolHandler(CONTEXT, 'reschedule_appointment', {
      clientEmail: 'ada@example.com',
      startsAt: '2026-08-05T14:00:00Z',
    })) as { error: string; details: string }

    expect(result.error).toBe('invalid_arguments')
    expect(result.details).toContain('newStartsAt')
  })

  it('returns unknown_tool for a name that does not exist', async () => {
    expect(await executeVoiceToolHandler(CONTEXT, 'delete_everything', {})).toEqual({
      error: 'unknown_tool',
    })
  })

  // Dispatch goes through the same builder, so the gate holds even if a model
  // invents the call or a provider replays a tool name from an earlier session.
  it('refuses to dispatch a manage-booking tool for a secure-mode agent', async () => {
    for (const name of ['find_appointment', 'cancel_appointment', 'reschedule_appointment']) {
      expect(
        await executeVoiceToolHandler({ ...CONTEXT, secureMode: true }, name, {
          clientEmail: 'ada@example.com',
          startsAt: '2026-08-05T14:00:00Z',
          newStartsAt: '2026-08-06T09:00:00Z',
        })
      ).toEqual({ error: 'unknown_tool' })
    }
  })
})
