export const GOOGLE_CALENDAR_SLUG = 'google-calendar'

export const GOOGLE_CALENDAR_EVENT_TYPES = [
  'appointment.created',
  'appointment.cancelled',
  'appointment.updated',
] as const

export type GoogleCalendarEventType = (typeof GOOGLE_CALENDAR_EVENT_TYPES)[number]

export const GOOGLE_CALENDAR_EVENTS: {
  value: GoogleCalendarEventType
  label: string
  description: string
}[] = [
  {
    value: 'appointment.created',
    label: 'New booking',
    description: 'An appointment is booked',
  },
  {
    value: 'appointment.cancelled',
    label: 'Booking cancelled',
    description: 'An appointment is cancelled',
  },
  {
    value: 'appointment.updated',
    label: 'Booking updated',
    description: 'An appointment is rescheduled or modified',
  },
]