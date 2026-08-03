import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildBookingTools } from './booking-tools'

vi.mock('@livekit/agents', () => ({
  tool: (def: unknown) => def,
}))

vi.mock('@/lib/data/booking-service', () => ({
  checkAvailabilityServiceRole: vi.fn(),
  findOrCreateClientServiceRole: vi.fn(),
  createAppointmentServiceRole: vi.fn(),
}))

vi.mock('@/lib/data/agents-service', () => ({
  getAgentByIdServiceRole: vi.fn(),
}))

vi.mock('@/lib/email/send-appointment-confirmation', () => ({
  sendAppointmentConfirmationEmail: vi.fn(),
}))

import {
  checkAvailabilityServiceRole,
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
} from '@/lib/data/booking-service'
import { getAgentByIdServiceRole } from '@/lib/data/agents-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'

const executeOpts = {} as never

function buildTools() {
  return buildBookingTools({
    organizationId: 'org-1',
    agentId: 'agent-1',
    conversationId: 'conv-1',
  })
}

describe('check_availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns available when the slot is free', async () => {
    vi.mocked(checkAvailabilityServiceRole).mockResolvedValue({
      available: true,
      conflicts: [],
    })

    const result = await buildTools().check_availability.execute(
      { startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T15:00:00Z' },
      executeOpts
    )

    expect(result).toEqual({ available: true })
    expect(checkAvailabilityServiceRole).toHaveBeenCalledWith(
      'org-1',
      '2026-08-03T14:00:00Z',
      '2026-08-03T15:00:00Z'
    )
  })

  it('returns the conflicting appointment title when taken', async () => {
    vi.mocked(checkAvailabilityServiceRole).mockResolvedValue({
      available: false,
      conflicts: [{ id: 'appt-1', title: 'Dentist visit', starts_at: 'x', ends_at: 'y', status: 'confirmed' }],
    })

    const result = await buildTools().check_availability.execute(
      { startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T15:00:00Z' },
      executeOpts
    )

    expect(result).toEqual({ available: false, conflictingTitle: 'Dentist visit' })
  })

  it('returns an error result instead of throwing when the check fails', async () => {
    vi.mocked(checkAvailabilityServiceRole).mockRejectedValue(new Error('db down'))

    const result = await buildTools().check_availability.execute(
      { startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T15:00:00Z' },
      executeOpts
    )

    expect(result).toEqual({ error: 'availability_check_failed' })
  })
})

describe('book_appointment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkAvailabilityServiceRole).mockResolvedValue({
      available: true,
      conflicts: [],
    })
    vi.mocked(findOrCreateClientServiceRole).mockResolvedValue({ id: 'client-1', isNew: true })
    vi.mocked(createAppointmentServiceRole).mockResolvedValue({ id: 'appt-1' } as never)
    vi.mocked(getAgentByIdServiceRole).mockResolvedValue({
      business_name: 'Smile Dental',
    } as never)
    vi.mocked(sendAppointmentConfirmationEmail).mockResolvedValue()
  })

  const args = {
    title: 'Consultation',
    clientName: 'Ada Lovelace',
    clientEmail: 'ada@example.com',
    clientPhone: '+15551234567',
    startsAt: '2026-08-03T14:00:00Z',
    endsAt: '2026-08-03T15:00:00Z',
  }

  it('books the appointment and returns success with the new ids', async () => {
    const result = await buildTools().book_appointment.execute(args, executeOpts)

    expect(result).toEqual({ success: true, appointmentId: 'appt-1', isNewClient: true })
    expect(findOrCreateClientServiceRole).toHaveBeenCalledWith('org-1', {
      name: 'Ada Lovelace',
      phoneNumber: '+15551234567',
      email: 'ada@example.com',
    })
    expect(createAppointmentServiceRole).toHaveBeenCalledWith('org-1', 'agent-1', 'conv-1', {
      title: 'Consultation',
      clientName: 'Ada Lovelace',
      clientPhone: '+15551234567',
      clientId: 'client-1',
      startsAt: '2026-08-03T14:00:00Z',
      endsAt: '2026-08-03T15:00:00Z',
      notes: undefined,
    })
    expect(sendAppointmentConfirmationEmail).toHaveBeenCalledWith({
      to: 'ada@example.com',
      clientName: 'Ada Lovelace',
      businessName: 'Smile Dental',
      startsAt: '2026-08-03T14:00:00Z',
      endsAt: '2026-08-03T15:00:00Z',
    })
  })

  it('normalizes an empty client phone to null', async () => {
    await buildTools().book_appointment.execute(
      { ...args, clientPhone: '  ' },
      executeOpts
    )

    expect(findOrCreateClientServiceRole).toHaveBeenCalledWith('org-1', {
      name: 'Ada Lovelace',
      phoneNumber: null,
      email: 'ada@example.com',
    })
    const insertArgs = vi.mocked(createAppointmentServiceRole).mock.calls[0][3]
    expect(insertArgs.clientPhone).toBeNull()
  })

  it('hard-blocks when the slot is unavailable and never inserts', async () => {
    vi.mocked(checkAvailabilityServiceRole).mockResolvedValue({
      available: false,
      conflicts: [{ id: 'appt-1', title: 'Dentist visit', starts_at: 'x', ends_at: 'y', status: 'confirmed' }],
    })

    const result = await buildTools().book_appointment.execute(args, executeOpts)

    expect(result).toEqual({ error: 'slot_unavailable', conflictingTitle: 'Dentist visit' })
    expect(findOrCreateClientServiceRole).not.toHaveBeenCalled()
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })

  it('still reports success when the confirmation email fails', async () => {
    vi.mocked(sendAppointmentConfirmationEmail).mockRejectedValue(new Error('smtp down'))

    const result = await buildTools().book_appointment.execute(args, executeOpts)

    expect(result).toEqual({ success: true, appointmentId: 'appt-1', isNewClient: true })
  })

  it('returns an error result instead of throwing when booking fails', async () => {
    vi.mocked(createAppointmentServiceRole).mockRejectedValue(new Error('db down'))

    const result = await buildTools().book_appointment.execute(args, executeOpts)

    expect(result).toEqual({ error: 'booking_failed' })
  })
})
