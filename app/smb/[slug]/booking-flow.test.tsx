import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookingFlow } from './booking-flow'

vi.mock('@/app/smb/actions', () => ({
  getPublicAvailableSlots: vi.fn(),
  createPublicAppointment: vi.fn(),
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const services = [
  {
    id: 'svc-1',
    name: 'Consultation',
    description: null,
    durationMinutes: 30,
    price: 50,
    serviceType: 'appointment' as const,
    showOnBookingPage: true,
  },
]
const staff = [{ id: 'staff-1', name: 'Ada Lovelace' }]
const slot = { startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }
const slotLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
  new Date(slot.startsAt)
)

function clickADayCell() {
  const dayButton = screen.getAllByRole('button').find((el) => /^\d+$/.test(el.textContent ?? ''))
  if (!dayButton) throw new Error('No day-of-month button found in the calendar grid')
  fireEvent.click(dayButton)
}

describe('BookingFlow', () => {
  it('advances from service selection to the staff step on click', async () => {
    const { getPublicAvailableSlots } = await import('@/app/smb/actions')
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({ slots: [] })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    fireEvent.click(screen.getByText('Consultation'))

    await screen.findByText(/any staff member/i)
  })

  it('shows a "no times available" message when a date is picked and slots come back empty', async () => {
    const { getPublicAvailableSlots } = await import('@/app/smb/actions')
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({ slots: [] })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    fireEvent.click(screen.getByText('Consultation'))
    fireEvent.click(await screen.findByText(/any staff member/i))

    await screen.findAllByRole('gridcell')
    clickADayCell()

    await waitFor(() => expect(getPublicAvailableSlots).toHaveBeenCalled())
    await screen.findByText(/no times available/i)
  })

  it('submits the contact form and shows the success screen on a successful booking', async () => {
    const { getPublicAvailableSlots, createPublicAppointment } = await import('@/app/smb/actions')
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({ slots: [slot] })
    vi.mocked(createPublicAppointment).mockResolvedValue({ success: true, appointmentId: 'appt-1' })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    fireEvent.click(screen.getByText('Consultation'))
    fireEvent.click(await screen.findByText(/any staff member/i))

    await screen.findAllByRole('gridcell')
    clickADayCell()

    const slotButton = await screen.findByText(slotLabel)
    fireEvent.click(slotButton)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByText(/continue/i))

    fireEvent.click(await screen.findByText(/confirm booking/i))

    await screen.findByText(/booked/i)
    expect(createPublicAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        serviceId: 'svc-1',
        clientName: 'Ada Lovelace',
        clientEmail: 'ada@example.com',
      })
    )
  })

  it('shows a slot-taken message and returns to the date/time step when the booking loses the race', async () => {
    const { getPublicAvailableSlots, createPublicAppointment } = await import('@/app/smb/actions')
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({ slots: [slot] })
    vi.mocked(createPublicAppointment).mockResolvedValue({ error: 'slot_taken' })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    fireEvent.click(screen.getByText('Consultation'))
    fireEvent.click(await screen.findByText(/any staff member/i))

    await screen.findAllByRole('gridcell')
    clickADayCell()

    const slotButton = await screen.findByText(slotLabel)
    fireEvent.click(slotButton)

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByText(/continue/i))

    fireEvent.click(await screen.findByText(/confirm booking/i))

    await screen.findByText(/no longer available/i)
  })
})
