import { describe, it, expect, vi } from 'vitest'
import { createClient, updateClient, deleteClient } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' },
  organizationId = 'org-1',
  insertError = null as { message: string } | null,
  updateError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
} = {}) {
  const insertResult = { error: insertError }
  const insert = vi.fn().mockReturnValue(insertResult)

  const updateEq2 = vi.fn().mockResolvedValue({ error: updateError })
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
  const update = vi.fn().mockReturnValue({ eq: updateEq1 })

  const deleteEq2 = vi.fn().mockResolvedValue({ error: deleteError })
  const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 })
  const del = vi.fn().mockReturnValue({ eq: deleteEq1 })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'clients') {
      return { insert, update, delete: del }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { insert, update, delete: del, memberEq },
  }
}

describe('createClient', () => {
  it('returns a validation error for an invalid phone number', async () => {
    const result = await createClient({
      name: 'Jane Doe',
      phoneNumber: 'not-a-phone',
      email: '',
      notes: '',
    })
    expect(result).toEqual({ error: 'Enter a valid phone number' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await createClient({
      name: 'Jane Doe',
      phoneNumber: '+14155551234',
      email: '',
      notes: '',
    })
    expect(result).toEqual({ error: 'You must be signed in to create a client.' })
  })

  it('scopes the insert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await createClient({
      name: 'Jane Doe',
      phoneNumber: '+14155551234',
      email: 'jane@example.com',
      notes: 'VIP',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        name: 'Jane Doe',
        phone_number: '+14155551234',
        email: 'jane@example.com',
        notes: 'VIP',
      })
    )
  })
})

describe('updateClient', () => {
  it('returns a validation error for an invalid phone number', async () => {
    const result = await updateClient({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Jane Doe',
      phoneNumber: 'bad',
      email: '',
      notes: '',
    })
    expect(result).toEqual({ error: 'Enter a valid phone number' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await updateClient({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Jane Doe',
      phoneNumber: '+14155551234',
      email: '',
      notes: '',
    })
    expect(result).toEqual({ error: 'You must be signed in to update a client.' })
  })
})

describe('deleteClient', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await deleteClient('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ error: 'You must be signed in to delete a client.' })
  })
})
