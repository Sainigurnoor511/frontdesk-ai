import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  updateNotificationSettings,
  updateFeatureSettings,
  unenrollTotpFactor,
  enrollTotpFactor,
  verifyTotpEnrollment,
  getTotpFactorStatus,
  updateLanguage,
  sendPasswordResetEmail,
} from './actions'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn(() => ({})) }))
// The recovery-code store is covered in recovery-codes.test.ts against an in-memory table; here it
// is only a dependency whose result the actions pass through.
vi.mock('@/lib/auth/recovery-codes', () => ({
  issueRecoveryCodes: vi.fn(async () => ({ codes: ['AAAAA-BBBBB'] })),
  countUnusedRecoveryCodes: vi.fn(async () => 7),
  deleteRecoveryCodes: vi.fn(async () => true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

async function mockSupabase(options: {
  factors?: unknown
  currentLevel?: string
  signedOut?: boolean
  organizationId?: string
  upsertError?: { message: string }
  enroll?: ReturnType<typeof vi.fn>
  challengeAndVerify?: ReturnType<typeof vi.fn>
  listFactors?: ReturnType<typeof vi.fn>
}) {
  const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')

  const unenroll = vi.fn().mockResolvedValue({ error: null })
  const enroll =
    options.enroll ??
    vi.fn().mockResolvedValue({
      data: { id: 'factor-new', totp: { qr_code: 'qr', secret: 'secret' } },
      error: null,
    })
  const challengeAndVerify = options.challengeAndVerify ?? vi.fn().mockResolvedValue({ error: null })
  const listFactors =
    options.listFactors ?? vi.fn().mockResolvedValue({ data: { totp: [totpFactor] }, error: null })
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null })
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null })
  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { organization_id: options.organizationId ?? 'org-1' },
              error: null,
            }),
          }),
        }),
      }
    }
    return { upsert }
  })

  vi.mocked(createSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue(
        options.signedOut
          ? { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } }
          : {
              data: { user: { id: 'u1', email: 'owner@example.com', factors: options.factors } },
              error: null,
            }
      ),
      resetPasswordForEmail,
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
          error: null,
        }),
        unenroll,
        enroll,
        challengeAndVerify,
        listFactors,
      },
    },
    from,
  } as never)

  return { from, unenroll, enroll, challengeAndVerify, listFactors, resetPasswordForEmail, upsert }
}

const PENDING = { factors: [totpFactor], currentLevel: 'aal1' }
const ELEVATED = { factors: [totpFactor], currentLevel: 'aal2' }
const NO_FACTOR = { factors: [] }

describe('updateNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a validation error for a non-boolean field', async () => {
    const result = await updateNotificationSettings({
      notifyPostCallSummary: 'yes' as unknown as boolean,
    })

    expect(result).toEqual({ error: expect.any(String) })
  })

  it('returns an error when no user is signed in', async () => {
    const { from } = await mockSupabase({ signedOut: true })

    expect(await updateNotificationSettings({ notifyPostCallSummary: false })).toEqual({
      error: 'You must be signed in to do this.',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('scopes the upsert to the caller organization on success', async () => {
    const { upsert } = await mockSupabase({ ...NO_FACTOR, organizationId: 'org-42' })

    const result = await updateNotificationSettings({
      notifyPostCallSummary: false,
      notifyAppointmentReminders: true,
    })

    expect(result).toEqual({ success: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        notify_post_call_summary: false,
        notify_appointment_reminders: true,
      }),
      expect.objectContaining({ onConflict: 'organization_id' })
    )
  })

  it('only includes fields that were provided (partial update)', async () => {
    const { upsert } = await mockSupabase(NO_FACTOR)

    await updateNotificationSettings({ notifyClientBookings: false })

    const row = upsert.mock.calls[0][0]
    expect(row).not.toHaveProperty('notify_post_call_summary')
    expect(row).not.toHaveProperty('notify_staff_bookings')
    expect(row.notify_client_bookings).toBe(false)
  })

  it('returns an error when the upsert fails', async () => {
    await mockSupabase({ ...NO_FACTOR, upsertError: { message: 'db error' } })

    expect(await updateNotificationSettings({ notifyPostCallSummary: true })).toEqual({
      error: 'Could not save notification settings. Please try again.',
    })
  })
})

describe('updateFeatureSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a validation error for a non-boolean field', async () => {
    const result = await updateFeatureSettings({
      featureServices: 'no' as unknown as boolean,
    })

    expect(result).toEqual({ error: expect.any(String) })
  })

  it('returns an error when no user is signed in', async () => {
    const { from } = await mockSupabase({ signedOut: true })

    expect(await updateFeatureSettings({ featureServices: false })).toEqual({
      error: 'You must be signed in to do this.',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('scopes the upsert to the caller organization on success', async () => {
    const { upsert } = await mockSupabase({ ...NO_FACTOR, organizationId: 'org-42' })

    const result = await updateFeatureSettings({
      featureGuides: false,
      featureCustomTimezones: true,
    })

    expect(result).toEqual({ success: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        feature_guides: false,
        feature_custom_timezones: true,
      }),
      expect.objectContaining({ onConflict: 'organization_id' })
    )
  })

  it('only includes fields that were provided (partial update)', async () => {
    const { upsert } = await mockSupabase(NO_FACTOR)

    await updateFeatureSettings({ featureStaff: true })

    const row = upsert.mock.calls[0][0]
    expect(row.feature_staff).toBe(true)
    expect(row).not.toHaveProperty('feature_services')
    expect(row).not.toHaveProperty('feature_guides')
  })

  it('returns an error when the upsert fails', async () => {
    await mockSupabase({ ...NO_FACTOR, upsertError: { message: 'db error' } })

    expect(await updateFeatureSettings({ featureServices: true })).toEqual({
      error: 'Could not save feature settings. Please try again.',
    })
  })
})

describe('two-factor settings actions — provider results', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enrollTotpFactor returns an error when enrollment fails', async () => {
    const enroll = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await mockSupabase({ ...NO_FACTOR, enroll })

    expect(await enrollTotpFactor()).toEqual({
      error: 'Could not start two-factor setup. Please try again.',
    })
  })

  it('verifyTotpEnrollment succeeds on a valid code', async () => {
    const { challengeAndVerify } = await mockSupabase(NO_FACTOR)

    expect(await verifyTotpEnrollment('factor-1', '123456')).toEqual({
      success: true,
      recoveryCodes: ['AAAAA-BBBBB'],
    })
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' })
  })

  it('verifyTotpEnrollment returns an error for an invalid code', async () => {
    const challengeAndVerify = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'invalid code' } })
    await mockSupabase({ ...NO_FACTOR, challengeAndVerify })

    expect(await verifyTotpEnrollment('factor-1', '000000')).toEqual({
      error: 'That code was incorrect or expired. Please try again.',
    })
  })

  it('getTotpFactorStatus reports enabled when a verified totp factor exists', async () => {
    const listFactors = vi.fn().mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }], phone: [] },
      error: null,
    })
    await mockSupabase({ ...ELEVATED, listFactors })

    expect(await getTotpFactorStatus()).toEqual({
      enabled: true,
      factorId: 'factor-1',
      recoveryCodesRemaining: 7,
    })
  })

  it('getTotpFactorStatus reports disabled when no verified totp factor exists', async () => {
    const listFactors = vi.fn().mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'unverified' }], phone: [] },
      error: null,
    })
    await mockSupabase({ ...NO_FACTOR, listFactors })

    expect(await getTotpFactorStatus()).toEqual({
      enabled: false,
      factorId: null,
      recoveryCodesRemaining: null,
    })
  })

  it('getTotpFactorStatus reports disabled when listFactors errors', async () => {
    const listFactors = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await mockSupabase({ ...ELEVATED, listFactors })

    expect(await getTotpFactorStatus()).toEqual({
      enabled: false,
      factorId: null,
      recoveryCodesRemaining: null,
    })
    expect(listFactors).toHaveBeenCalled()
  })
})

describe('two-factor settings actions — pending session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses to unenroll the factor, without calling Supabase', async () => {
    // The one action that can remove a user's second factor. It used to rely entirely on proxy
    // interception plus an assumption about what GoTrue would refuse — an assumption nobody had
    // confirmed against a running instance.
    const { unenroll } = await mockSupabase(PENDING)

    expect(await unenrollTotpFactor('factor-1')).toEqual({
      error: 'You must be signed in to do this.',
    })
    expect(unenroll).not.toHaveBeenCalled()
  })

  it('refuses to start a new enrollment', async () => {
    const { enroll } = await mockSupabase(PENDING)

    expect(await enrollTotpFactor()).toEqual({ error: 'You must be signed in to do this.' })
    expect(enroll).not.toHaveBeenCalled()
  })

  it('refuses to verify an enrollment', async () => {
    const { challengeAndVerify } = await mockSupabase(PENDING)

    expect(await verifyTotpEnrollment('factor-1', '123456')).toEqual({
      error: 'You must be signed in to do this.',
    })
    expect(challengeAndVerify).not.toHaveBeenCalled()
  })

  it('reports no factor rather than listing the real ones', async () => {
    const { listFactors } = await mockSupabase(PENDING)

    expect(await getTotpFactorStatus()).toEqual({
      enabled: false,
      factorId: null,
      recoveryCodesRemaining: null,
    })
    expect(listFactors).not.toHaveBeenCalled()
  })

  it('refuses to send a password reset to the account email', async () => {
    const { resetPasswordForEmail } = await mockSupabase(PENDING)

    expect(await sendPasswordResetEmail()).toEqual({
      error: 'Could not determine your email address.',
    })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('refuses a settings write before resolving the organization', async () => {
    const { from, upsert } = await mockSupabase(PENDING)

    expect(await updateLanguage({ language: 'en' })).toEqual({
      error: 'You must be signed in to do this.',
    })
    expect(from).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('two-factor settings actions — elevated session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unenrolls once the session has passed the challenge', async () => {
    const { unenroll } = await mockSupabase(ELEVATED)

    expect(await unenrollTotpFactor('factor-1')).toEqual({ success: true })
    expect(unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' })
  })

  it('still lets a user with no factor enrol one', async () => {
    const { enroll } = await mockSupabase({ factors: [] })

    expect(await enrollTotpFactor()).toEqual({
      enrollment: { factorId: 'factor-new', qrCode: 'qr', secret: 'secret' },
    })
    expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' })
  })

  it('saves settings for an elevated session', async () => {
    const { upsert } = await mockSupabase(ELEVATED)

    expect(await updateLanguage({ language: 'en' })).toEqual({ success: true })
    expect(upsert).toHaveBeenCalled()
  })
})
