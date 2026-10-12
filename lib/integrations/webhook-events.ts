export const WEBHOOK_SLUG = 'webhook-tool'

export const WEBHOOK_EVENT_TYPES = [
  'appointment.created',
  'appointment.cancelled',
  'conversation.completed',
  'caller_message.created',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export const WEBHOOK_EVENTS: { value: WebhookEventType; label: string; description: string }[] = [
  { value: 'appointment.created', label: 'New booking', description: 'An appointment is booked' },
  { value: 'appointment.cancelled', label: 'Booking cancelled', description: 'An appointment is cancelled' },
  { value: 'conversation.completed', label: 'Call ended', description: 'A call finishes with a transcript' },
  {
    value: 'caller_message.created',
    label: 'Message for a human',
    description: 'A caller asks to speak to a person and the receptionist takes a message',
  },
]
