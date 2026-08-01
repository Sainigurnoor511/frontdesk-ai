import { describe, it, expect, vi } from 'vitest'
import { createStaffMember, updateStaffMember, deleteStaffMember } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
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
    if (table === 'staff_members') {
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

describe('createStaffMember', () => {
  it('returns a validation error for a missing name', async () => {
    const result = await createStaffMember({
      fullName: '',
      displayName: '',
      description: '',
      email: '',
      phone: '',
      isActive: true,
      showOnBookingPage: true,
    })
    expect(result).toEqual({ error: 'Full name is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await createStaffMember({
      fullName: 'Jane Doe',
      displayName: '',
      description: '',
      email: '',
      phone: '',
      isActive: true,
      showOnBookingPage: true,
    })
    expect(result).toEqual({ error: 'You must be signed in to create a staff member.' })
  })

  it('scopes the insert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await createStaffMember({
      fullName: 'Jane Doe',
      displayName: 'Jane',
      description: '10 years of experience',
      email: 'jane@example.com',
      phone: '+14155551234',
      isActive: true,
      showOnBookingPage: true,
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        full_name: 'Jane Doe',
        display_name: 'Jane',
        description: '10 years of experience',
        email: 'jane@example.com',
        phone: '+14155551234',
        is_active: true,
        show_on_booking_page: true,
      })
    )
  })
})

describe('updateStaffMember', () => {
  it('returns a validation error for a missing name', async () => {
    const result = await updateStaffMember({
      id: '11111111-1111-1111-1111-111111111111',
      fullName: '',
      displayName: '',
      description: '',
      email: '',
      phone: '',
      isActive: true,
      showOnBookingPage: true,
    })
    expect(result).toEqual({ error: 'Full name is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await updateStaffMember({
      id: '11111111-1111-1111-1111-111111111111',
      fullName: 'Jane Doe',
      displayName: '',
      description: '',
      email: '',
      phone: '',
      isActive: true,
      showOnBookingPage: true,
    })
    expect(result).toEqual({ error: 'You must be signed in to update a staff member.' })
  })
})

describe('deleteStaffMember', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await deleteStaffMember('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ error: 'You must be signed in to delete a staff member.' })
  })
})
