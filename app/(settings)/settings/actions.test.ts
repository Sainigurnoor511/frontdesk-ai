import { describe, it, expect, vi } from 'vitest'
import { updateNotificationSettings, updateFeatureSettings } from './actions'

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
} = {}) {
  const upsertResult = { error: upsertError }
  const upsert = vi.fn().mockReturnValue(upsertResult)

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
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { upsert, memberEq },
  }
}

describe('updateNotificationSettings', () => {
  it('returns a validation error for a non-boolean field', async () => {
    const result = await updateNotificationSettings({
      notifyPostCallSummary: 'yes' as unknown as boolean,
    })
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateNotificationSettings({ notifyPostCallSummary: false })
    expect(result).toEqual({ error: 'You must be signed in to do this.' })
  })

  it('scopes the upsert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateNotificationSettings({
      notifyPostCallSummary: false,
      notifyAppointmentReminders: true,
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        notify_post_call_summary: false,
        notify_appointment_reminders: true,
      }),
      expect.objectContaining({ onConflict: 'organization_id' })
    )
  })

  it('only includes fields that were provided (partial update)', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-1' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    await updateNotificationSettings({ notifyClientBookings: false })

    const callArg = supabase.__mocks.upsert.mock.calls[0][0]
    expect(callArg).not.toHaveProperty('notify_post_call_summary')
    expect(callArg).not.toHaveProperty('notify_staff_bookings')
    expect(callArg.notify_client_bookings).toBe(false)
  })

  it('returns an error when the upsert fails', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ upsertError: { message: 'db error' } })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateNotificationSettings({ notifyPostCallSummary: true })
    expect(result).toEqual({ error: 'Could not save notification settings. Please try again.' })
  })
})

describe('updateFeatureSettings', () => {
  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateFeatureSettings({ featureServices: false })
    expect(result).toEqual({ error: 'You must be signed in to do this.' })
  })

  it('scopes the upsert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateFeatureSettings({
      featureGuides: false,
      featureCustomTimezones: true,
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        feature_guides: false,
        feature_custom_timezones: true,
      }),
      expect.objectContaining({ onConflict: 'organization_id' })
    )
  })
})
