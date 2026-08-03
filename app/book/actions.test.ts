import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/availability-engine', () => ({
  getAvailableSlots: vi.fn(),
}))
vi.mock('@/lib/data/booking-service', () => ({
  findOrCreateClientServiceRole: vi.fn(),
  createAppointmentServiceRole: vi.fn(),
}))
vi.mock('@/lib/email/send-appointment-confirmation', () => ({
  sendAppointmentConfirmationEmail: vi.fn(),
}))
vi.mock('@/lib/voice/rate-limit', () => ({
  checkAndConsumeRateLimit: vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/lib/data/conversations-service', () => ({
  createConversation: vi.fn(),
  updateConversationStatus: vi.fn(),
}))
vi.mock('livekit-server-sdk', () => ({
  AccessToken: vi.fn().mockImplementation(() => ({
    addGrant: vi.fn(),
    toJwt: vi.fn().mockResolvedValue('token'),
  })),
  RoomServiceClient: vi.fn().mockImplementation(() => ({
    createRoom: vi.fn().mockResolvedValue({}),
  })),
}))

import { getAvailableSlots } from '@/lib/data/availability-engine'
import { findOrCreateClientServiceRole, createAppointmentServiceRole } from '@/lib/data/booking-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import { getPublicAvailableSlots, createPublicAppointment } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.TURNSTILE_SECRET_KEY
  vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: true, remaining: 4 })
})

describe('getPublicAvailableSlots', () => {
  it('returns slots for the requested date', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] },
    ])

    const result = await getPublicAvailableSlots({
      organizationId: '11111111-1111-1111-1111-111111111111',
      serviceId: '22222222-2222-2222-2222-222222222222',
      date: '2026-08-10',
    })

    expect(result).toEqual({ slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] })
  })

  it('returns a validation error for a malformed date', async () => {
    const result = await getPublicAvailableSlots({
      organizationId: '11111111-1111-1111-1111-111111111111',
      serviceId: '22222222-2222-2222-2222-222222222222',
      date: 'not-a-date',
    })

    expect('error' in result).toBe(true)
  })
})

describe('createPublicAppointment', () => {
  const validInput = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    serviceId: '22222222-2222-2222-2222-222222222222',
    startsAt: '2026-08-10T09:00:00.000Z',
    endsAt: '2026-08-10T09:30:00.000Z',
    clientName: 'Ada Lovelace',
    clientEmail: 'ada@example.com',
  }

  it('books the appointment when the slot is still open', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] },
    ])
    vi.mocked(findOrCreateClientServiceRole).mockResolvedValue({ id: 'client-1', isNew: true })
    vi.mocked(createAppointmentServiceRole).mockResolvedValue({ id: 'appt-1' } as never)
    vi.mocked(sendAppointmentConfirmationEmail).mockResolvedValue()

    const result = await createPublicAppointment(validInput)

    expect(result).toEqual({ success: true, appointmentId: 'appt-1' })
    expect(createAppointmentServiceRole).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      null,
      null,
      expect.objectContaining({
        clientName: 'Ada Lovelace',
        clientId: 'client-1',
        serviceId: '22222222-2222-2222-2222-222222222222',
      })
    )
  })

  it('refuses to book when the slot is no longer open', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([{ date: '2026-08-10', slots: [] }])

    const result = await createPublicAppointment(validInput)

    expect(result).toEqual({ error: 'slot_taken' })
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })

  it('rejects when rate limited', async () => {
    vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })

    const result = await createPublicAppointment(validInput)

    expect('error' in result).toBe(true)
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })

  it('requires a turnstile token when TURNSTILE_SECRET_KEY is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret'

    const result = await createPublicAppointment(validInput)

    expect('error' in result).toBe(true)
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })

  it('uses the provided businessName in the confirmation email when given', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] },
    ])
    vi.mocked(findOrCreateClientServiceRole).mockResolvedValue({ id: 'client-1', isNew: true })
    vi.mocked(createAppointmentServiceRole).mockResolvedValue({ id: 'appt-1' } as never)
    vi.mocked(sendAppointmentConfirmationEmail).mockResolvedValue()

    await createPublicAppointment({ ...validInput, businessName: 'Acme Gym' })

    expect(sendAppointmentConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: 'Acme Gym' })
    )
  })
})
