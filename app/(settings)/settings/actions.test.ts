import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  unenrollTotpFactor,
  enrollTotpFactor,
  verifyTotpEnrollment,
  getTotpFactorStatus,
  updateLanguage,
  sendPasswordResetEmail,
} from './actions'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

async function mockSupabase(options: { factors?: unknown; currentLevel?: string }) {
  const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')

  const unenroll = vi.fn().mockResolvedValue({ error: null })
  const enroll = vi.fn().mockResolvedValue({
    data: { id: 'factor-new', totp: { qr_code: 'qr', secret: 'secret' } },
    error: null,
  })
  const challengeAndVerify = vi.fn().mockResolvedValue({ error: null })
  const listFactors = vi.fn().mockResolvedValue({ data: { totp: [totpFactor] }, error: null })
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null })
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { organization_id: 'org-1' }, error: null }) }),
        }),
      }
    }
    return { upsert }
  })

  vi.mocked(createSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1', email: 'owner@example.com', factors: options.factors } },
        error: null,
      }),
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

    expect(await getTotpFactorStatus()).toEqual({ enabled: false, factorId: null })
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
