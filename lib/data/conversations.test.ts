import { describe, it, expect, vi } from 'vitest'
import {
  getConversationsForOrg,
  getConversationById,
  getCallerMessagesForOrg,
} from './conversations'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

describe('getConversationsForOrg', () => {
  it('returns an empty array when no user is signed in', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never)

    const result = await getConversationsForOrg()
    expect(result).toEqual([])
  })

  it('returns an empty array when the user has no organization', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const single = vi.fn().mockResolvedValue({ data: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from,
    } as never)

    const result = await getConversationsForOrg()
    expect(result).toEqual([])
  })

  it('maps conversation rows into the Conversation shape', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
    const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

    const conversationsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'conv-1',
          organization_id: 'org-1',
          agent_id: 'agent-1',
          channel: 'phone',
          outcome: 'successful',
          category: 'General Inquiry',
          summary: 'Caller asked about hours.',
          duration_seconds: 120,
          ended_reason: 'caller_hangup',
          transcript: [{ role: 'agent', text: 'Hello', timestampSeconds: 0 }],
          call_goals: [{ name: 'Book appointment', status: 'success', reasoning: 'Done' }],
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const conversationsEq = vi.fn().mockReturnValue({ order: conversationsOrder })
    const conversationsSelect = vi.fn().mockReturnValue({ eq: conversationsEq })

    const from = vi.fn((table: string) => {
      if (table === 'members') return { select: memberSelect }
      if (table === 'conversations') return { select: conversationsSelect }
      throw new Error(`Unexpected table: ${table}`)
    })

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from,
    } as never)

    const result = await getConversationsForOrg()
    expect(result).toEqual([
      {
        id: 'conv-1',
        organizationId: 'org-1',
        agentId: 'agent-1',
        channel: 'phone',
        outcome: 'successful',
        category: 'General Inquiry',
        summary: 'Caller asked about hours.',
        durationSeconds: 120,
        endedReason: 'caller_hangup',
        transcript: [{ role: 'agent', text: 'Hello', timestampSeconds: 0 }],
        callGoals: [{ name: 'Book appointment', status: 'success', reasoning: 'Done' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
  })
})

describe('getConversationById', () => {
  it('returns null when no user is signed in', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never)

    const result = await getConversationById('conv-1')
    expect(result).toBeNull()
  })

  it('returns null when the conversation is not found', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
    const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

    const convSingle = vi.fn().mockResolvedValue({ data: null })
    const convEq2 = vi.fn().mockReturnValue({ single: convSingle })
    const convEq1 = vi.fn().mockReturnValue({ eq: convEq2 })
    const convSelect = vi.fn().mockReturnValue({ eq: convEq1 })

    const from = vi.fn((table: string) => {
      if (table === 'members') return { select: memberSelect }
      if (table === 'conversations') return { select: convSelect }
      throw new Error(`Unexpected table: ${table}`)
    })

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from,
    } as never)

    const result = await getConversationById('conv-1')
    expect(result).toBeNull()
  })
})

describe('getCallerMessagesForOrg', () => {
  it('returns an empty array when no user is signed in', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never)

    const result = await getCallerMessagesForOrg()
    expect(result).toEqual([])
  })

  it('returns an empty array when the user has no organization', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const single = vi.fn().mockResolvedValue({ data: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from,
    } as never)

    const result = await getCallerMessagesForOrg()
    expect(result).toEqual([])
  })

  it('maps caller message rows into the CallerMessage shape', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
    const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

    const messagesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'msg-1',
          organization_id: 'org-1',
          conversation_id: 'conv-1',
          caller_name: 'Jane Doe',
          caller_phone: '+14155551234',
          summary: 'Wants a callback',
          quoted_line: 'Please call me back',
          is_read: false,
          converted_to_client_id: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const messagesEq = vi.fn().mockReturnValue({ order: messagesOrder })
    const messagesSelect = vi.fn().mockReturnValue({ eq: messagesEq })

    const from = vi.fn((table: string) => {
      if (table === 'members') return { select: memberSelect }
      if (table === 'caller_messages') return { select: messagesSelect }
      throw new Error(`Unexpected table: ${table}`)
    })

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from,
    } as never)

    const result = await getCallerMessagesForOrg()
    expect(result).toEqual([
      {
        id: 'msg-1',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        callerName: 'Jane Doe',
        callerPhone: '+14155551234',
        summary: 'Wants a callback',
        quotedLine: 'Please call me back',
        isRead: false,
        convertedToClientId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
  })
})

describe('createConversation', () => {
  it('inserts a conversation row with status active and returns it mapped', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const { createConversation } = await import('./conversations-service')

    const mockRow = {
      id: 'conv-1',
      organization_id: 'org-1',
      agent_id: 'agent-1',
      channel: 'voice_web',
      outcome: 'successful',
      category: null,
      summary: null,
      duration_seconds: 0,
      ended_reason: null,
      transcript: [],
      call_goals: [],
      created_at: '2026-08-02T00:00:00Z',
    }

    const single = vi.fn().mockResolvedValue({ data: mockRow, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await createConversation({
      organizationId: 'org-1',
      agentId: 'agent-1',
      channel: 'voice_web',
      status: 'active',
    })

    expect(from).toHaveBeenCalledWith('conversations')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        agent_id: 'agent-1',
        channel: 'voice_web',
        status: 'active',
      })
    )
    expect(result.id).toBe('conv-1')
  })
})
