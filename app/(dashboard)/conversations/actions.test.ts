import { describe, it, expect, vi } from 'vitest'
import {
  markMessageAsRead,
  markAllMessagesAsRead,
  deleteMessage,
  createContactFromMessage,
} from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  updateError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  insertError = null as { message: string } | null,
  insertedClientId = 'client-1' as string | null,
  message = {
    id: 'msg-1',
    caller_name: 'Jane Doe',
    caller_phone: '+14155551234',
  } as { id: string; caller_name: string | null; caller_phone: string | null } | null,
} = {}) {
  const updateEq2 = vi.fn().mockResolvedValue({ error: updateError })
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
  const update = vi.fn().mockReturnValue({ eq: updateEq1 })

  const deleteEq2 = vi.fn().mockResolvedValue({ error: deleteError })
  const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 })
  const del = vi.fn().mockReturnValue({ eq: deleteEq1 })

  const messageSingle = vi.fn().mockResolvedValue({ data: message })
  const messageEq2 = vi.fn().mockReturnValue({ single: messageSingle })
  const messageEq1 = vi.fn().mockReturnValue({ eq: messageEq2 })
  const messageSelect = vi.fn().mockReturnValue({ eq: messageEq1 })

  const insertSingle = vi.fn().mockResolvedValue({
    data: insertedClientId ? { id: insertedClientId } : null,
    error: insertError,
  })
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
  const insert = vi.fn().mockReturnValue({ select: insertSelect })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'caller_messages') {
      return { update, delete: del, select: messageSelect }
    }
    if (table === 'clients') {
      return { insert }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { update, delete: del, insert, messageEq1 },
  }
}

describe('markMessageAsRead', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await markMessageAsRead('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ error: 'You must be signed in to update this message.' })
  })

  it('marks the message as read when scoped correctly', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await markMessageAsRead('11111111-1111-1111-1111-111111111111')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith({ is_read: true })
  })
})

describe('markAllMessagesAsRead', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await markAllMessagesAsRead()
    expect(result).toEqual({ error: 'You must be signed in to update messages.' })
  })

  it('marks all unread messages as read', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase()
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await markAllMessagesAsRead()
    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith({ is_read: true })
  })
})

describe('deleteMessage', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await deleteMessage('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ error: 'You must be signed in to delete this message.' })
  })

  it('deletes the message when scoped correctly', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase()
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await deleteMessage('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.delete).toHaveBeenCalled()
  })
})

describe('createContactFromMessage', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await createContactFromMessage('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ error: 'You must be signed in to create a contact.' })
  })

  it('returns an error when the message is missing name or phone', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({
      message: { id: 'msg-1', caller_name: null, caller_phone: null },
    })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await createContactFromMessage('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({
      error: 'This message is missing a name or phone number to create a contact.',
    })
  })

  it('creates a client and updates the message on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42', insertedClientId: 'client-9' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await createContactFromMessage('11111111-1111-1111-1111-111111111111')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        name: 'Jane Doe',
        phone_number: '+14155551234',
      })
    )
    expect(supabase.__mocks.update).toHaveBeenCalledWith({
      converted_to_client_id: 'client-9',
      is_read: true,
    })
  })
})
