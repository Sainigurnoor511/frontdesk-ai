import { describe, it, expect, vi } from 'vitest'
import { updateBookingPageEnabled, toggleServiceOnBookingPage } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  upsertError = null as { message: string } | null,
  updateError = null as { message: string } | null,
} = {}) {
  const upsertResult = { error: upsertError }
  const upsert = vi.fn().mockReturnValue(upsertResult)

  const updateEqOrg = vi.fn().mockResolvedValue({ error: updateError })
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg })
  const update = vi.fn().mockReturnValue({ eq: updateEqId })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'organization_settings') {
      return { upsert }
    }
    if (table === 'services') {
      return { update }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { upsert, update, updateEqId, updateEqOrg, memberEq },
  }
}

describe('updateBookingPageEnabled', () => {
  it('returns a validation error for a non-boolean field', async () => {
    const result = await updateBookingPageEnabled({
      bookingPageEnabled: 'yes' as unknown as boolean,
    })
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateBookingPageEnabled({ bookingPageEnabled: false })
    expect(result).toEqual({ error: 'You must be signed in to do this.' })
  })

  it('scopes the upsert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateBookingPageEnabled({ bookingPageEnabled: false })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        booking_page_enabled: false,
      }),
      expect.objectContaining({ onConflict: 'organization_id' })
    )
  })

  it('returns an error when the upsert fails', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ upsertError: { message: 'db error' } })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateBookingPageEnabled({ bookingPageEnabled: true })
    expect(result).toEqual({ error: 'Could not save booking page settings. Please try again.' })
  })
})

describe('toggleServiceOnBookingPage', () => {
  it('returns a validation error for a non-uuid serviceId', async () => {
    const result = await toggleServiceOnBookingPage('not-a-uuid', true)
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await toggleServiceOnBookingPage('11111111-1111-1111-1111-111111111111', true)
    expect(result).toEqual({ error: 'You must be signed in to do this.' })
  })

  it('scopes the update to the correct organization and service on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const serviceId = '11111111-1111-1111-1111-111111111111'
    const result = await toggleServiceOnBookingPage(serviceId, false)

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ show_on_booking_page: false })
    )
    expect(supabase.__mocks.updateEqId).toHaveBeenCalledWith('id', serviceId)
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  it('returns an error when the update fails', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ updateError: { message: 'db error' } })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await toggleServiceOnBookingPage(
      '11111111-1111-1111-1111-111111111111',
      true
    )
    expect(result).toEqual({ error: 'Could not update service. Please try again.' })
  })
})
