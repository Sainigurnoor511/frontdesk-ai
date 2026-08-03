import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendAppointmentConfirmationEmail } from './send-appointment-confirmation'

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

describe('sendAppointmentConfirmationEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'Closeloop <notifications@example.com>'
    sendMock.mockReset()
    sendMock.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('sends an HTML confirmation with the booking details', async () => {
    await sendAppointmentConfirmationEmail({
      to: 'ada@example.com',
      clientName: 'Ada Lovelace',
      businessName: 'Smile Dental',
      startsAt: '2026-08-03T14:00:00+05:00',
      endsAt: '2026-08-03T15:00:00+05:00',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = sendMock.mock.calls[0][0]
    expect(payload.from).toBe('Closeloop <notifications@example.com>')
    expect(payload.to).toBe('ada@example.com')
    expect(payload.subject).toContain('Smile Dental')
    expect(payload.html).toContain('Appointment confirmation')
    expect(payload.html).toContain('Ada Lovelace')
    expect(payload.html).toContain('Smile Dental')
    expect(payload.html).toContain('2:00 PM')
    expect(payload.html).toContain('3:00 PM')
  })

  it('renders wall-clock time in the ISO offset, not UTC', async () => {
    await sendAppointmentConfirmationEmail({
      to: 'ada@example.com',
      clientName: 'Ada Lovelace',
      businessName: 'Smile Dental',
      startsAt: '2026-08-03T14:00:00-08:00',
      endsAt: '2026-08-03T15:00:00-08:00',
    })

    const payload = sendMock.mock.calls[0][0]
    expect(payload.html).toContain('2:00 PM')
    expect(payload.html).not.toContain('10:00 PM')
  })

  it('escapes user-provided names in the HTML', async () => {
    await sendAppointmentConfirmationEmail({
      to: 'ada@example.com',
      clientName: 'Ada <script>',
      businessName: 'Smile & Co',
      startsAt: '2026-08-03T14:00:00Z',
      endsAt: '2026-08-03T15:00:00Z',
    })

    const payload = sendMock.mock.calls[0][0]
    expect(payload.html).toContain('Ada &lt;script&gt;')
    expect(payload.html).toContain('Smile &amp; Co')
    expect(payload.html).not.toContain('<script>')
  })

  it('throws when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY
    await expect(
      sendAppointmentConfirmationEmail({
        to: 'ada@example.com',
        clientName: 'Ada Lovelace',
        businessName: 'Smile Dental',
        startsAt: '2026-08-03T14:00:00Z',
        endsAt: '2026-08-03T15:00:00Z',
      })
    ).rejects.toThrow('Resend is not configured')
  })

  it('throws when Resend reports a send error', async () => {
    sendMock.mockResolvedValue({ error: new Error('domain not verified') })
    await expect(
      sendAppointmentConfirmationEmail({
        to: 'ada@example.com',
        clientName: 'Ada Lovelace',
        businessName: 'Smile Dental',
        startsAt: '2026-08-03T14:00:00Z',
        endsAt: '2026-08-03T15:00:00Z',
      })
    ).rejects.toThrow('domain not verified')
  })
})
