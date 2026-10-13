import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendMfaRecoveryNotice } from './send-mfa-recovery-notice'

const { sendMock, MockResend } = vi.hoisted(() => {
  const sendMock = vi.fn()
  class MockResend {
    emails = { send: sendMock }
  }
  return { sendMock, MockResend }
})

vi.mock('resend', () => ({
  Resend: MockResend,
}))

const ORIGINAL_ENV = { ...process.env }
const USED_AT = new Date('2026-10-13T09:30:00Z')

describe('sendMfaRecoveryNotice', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'Frontdesk <security@example.com>'
    sendMock.mockReset()
    sendMock.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('sends the owner the time, in UTC, and that two-factor was removed', async () => {
    await sendMfaRecoveryNotice({ to: 'owner@example.com', usedAt: USED_AT, otherSessionsRevoked: true })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = sendMock.mock.calls[0][0]
    expect(payload.from).toBe('Frontdesk <security@example.com>')
    expect(payload.to).toBe('owner@example.com')
    expect(payload.subject).toBe('A recovery code was used on your Frontdesk.ai account')
    expect(payload.html).toContain('Tuesday, October 13, 2026 at 9:30 AM UTC')
    expect(payload.html).toContain('Two-factor authentication has been removed')
    expect(payload.html).toContain('Your other sessions were signed out.')
    expect(payload.html).not.toContain('could <strong>not</strong>')
  })

  it('says plainly when the other sessions could not be signed out', async () => {
    await sendMfaRecoveryNotice({ to: 'owner@example.com', usedAt: USED_AT, otherSessionsRevoked: false })

    const payload = sendMock.mock.calls[0][0]
    expect(payload.html).toContain('could <strong>not</strong> be signed out')
    expect(payload.html).toContain('Sign out all devices')
    expect(payload.html).not.toContain('Your other sessions were signed out.')
  })

  it('throws when Resend is not configured, without calling it', async () => {
    delete process.env.RESEND_API_KEY
    await expect(
      sendMfaRecoveryNotice({ to: 'owner@example.com', usedAt: USED_AT, otherSessionsRevoked: true })
    ).rejects.toThrow('Resend is not configured')

    process.env.RESEND_API_KEY = 're_test_key'
    delete process.env.RESEND_FROM_EMAIL
    await expect(
      sendMfaRecoveryNotice({ to: 'owner@example.com', usedAt: USED_AT, otherSessionsRevoked: true })
    ).rejects.toThrow('Resend is not configured')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('throws when Resend reports a send error', async () => {
    sendMock.mockResolvedValue({ error: { message: 'domain not verified' } })
    await expect(
      sendMfaRecoveryNotice({ to: 'owner@example.com', usedAt: USED_AT, otherSessionsRevoked: true })
    ).rejects.toThrow('domain not verified')
  })
})
