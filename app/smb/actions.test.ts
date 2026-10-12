import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/availability-engine', () => ({
  getAvailableSlots: vi.fn(),
}))
vi.mock('@/lib/data/booking-service', () => ({
  findOrCreateClientServiceRole: vi.fn(),
  createAppointmentServiceRole: vi.fn(),
  getUpcomingAppointmentsByEmailServiceRole: vi.fn(),
  rescheduleAppointmentByEmailServiceRole: vi.fn(),
  cancelAppointmentByEmailServiceRole: vi.fn(),
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
vi.mock('@/lib/voice/end-call', () => ({
  endLiveKitCallRoom: vi.fn(),
}))
vi.mock('@/lib/voice/livekit-room', () => ({
  createLiveKitCallRoom: vi.fn(),
}))
vi.mock('./access', () => ({
  canUseBookingPage: vi.fn().mockResolvedValue(true),
  BOOKING_PAGE_UNAVAILABLE: 'Online booking is not available for this business.',
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
import {
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
  getUpcomingAppointmentsByEmailServiceRole,
  rescheduleAppointmentByEmailServiceRole,
} from '@/lib/data/booking-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import {
  getPublicAvailableSlots,
  createPublicAppointment,
  lookupPublicAppointments,
  reschedulePublicAppointment,
} from './actions'

const ORG = '11111111-1111-1111-1111-111111111111'
const APPOINTMENT = '33333333-3333-3333-3333-333333333333'
const READ_FAILED = 'Something went wrong on our end. Please try again.'

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

describe('booking page availability gate', () => {
  it('refuses slot lookups for a business whose booking page is off', async () => {
    const { canUseBookingPage } = await import('./access')
    vi.mocked(canUseBookingPage).mockResolvedValueOnce(false)

    const result = await getPublicAvailableSlots({
      organizationId: '11111111-1111-1111-1111-111111111111',
      serviceId: '22222222-2222-2222-2222-222222222222',
      date: '2026-08-10',
    })

    expect(result).toEqual({ error: 'Online booking is not available for this business.' })
    expect(getAvailableSlots).not.toHaveBeenCalled()
  })
})

describe('lookupPublicAppointments', () => {
  it('returns the caller\'s upcoming appointments', async () => {
    vi.mocked(getUpcomingAppointmentsByEmailServiceRole).mockResolvedValue([
      {
        id: APPOINTMENT,
        title: 'Haircut',
        starts_at: '2026-08-05T14:00:00+00:00',
        ends_at: '2026-08-05T14:30:00+00:00',
        service_id: null,
      },
    ] as never)

    expect(await lookupPublicAppointments({ organizationId: ORG, email: 'ada@example.com' })).toEqual(
      {
        appointments: [
          {
            id: APPOINTMENT,
            title: 'Haircut',
            startsAt: '2026-08-05T14:00:00+00:00',
            endsAt: '2026-08-05T14:30:00+00:00',
            serviceId: null,
          },
        ],
      }
    )
  })

  // A failed read used to be absorbed into `[]`, which this page renders as "no
  // upcoming appointments found for that email" — a database error shown to the
  // visitor as a real answer about their bookings.
  it('surfaces a read failure instead of rendering it as "nothing booked"', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getUpcomingAppointmentsByEmailServiceRole).mockRejectedValue(new Error('boom'))

    expect(await lookupPublicAppointments({ organizationId: ORG, email: 'ada@example.com' })).toEqual(
      { error: READ_FAILED }
    )

    consoleError.mockRestore()
  })
})

describe('reschedulePublicAppointment', () => {
  const input = {
    organizationId: ORG,
    appointmentId: APPOINTMENT,
    email: 'ada@example.com',
    startsAt: '2026-08-10T09:00:00.000Z',
    endsAt: '2026-08-10T09:30:00.000Z',
  }

  // Issue 8 of the review: the voice tool excluded the appointment from its own
  // availability and the web path did not, so a client shifting an appointment
  // within its own footprint was blocked by their own booking.
  it('excludes the appointment being moved from its own availability check', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-10', slots: [{ startsAt: input.startsAt, endsAt: input.endsAt }] },
    ])
    vi.mocked(rescheduleAppointmentByEmailServiceRole).mockResolvedValue({ success: true })

    expect(await reschedulePublicAppointment(input)).toEqual({ success: true })
    expect(getAvailableSlots).toHaveBeenCalledWith(ORG, {
      serviceId: '',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
      excludeAppointmentId: APPOINTMENT,
    })
  })

  it('fails closed, writing nothing, when the availability read throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('boom'))

    expect(await reschedulePublicAppointment(input)).toEqual({ error: READ_FAILED })
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})

describe('createPublicAppointment read failures', () => {
  it('refuses to book when the availability read throws, rather than assuming the slot is free', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('boom'))

    const result = await createPublicAppointment({
      organizationId: ORG,
      serviceId: '22222222-2222-2222-2222-222222222222',
      startsAt: '2026-08-10T09:00:00.000Z',
      endsAt: '2026-08-10T09:30:00.000Z',
      clientName: 'Ada Lovelace',
      clientEmail: 'ada@example.com',
    })

    expect(result).toEqual({ error: READ_FAILED })
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
