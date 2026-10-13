import { formatInTimeZone } from '@/lib/email/format'
import type { NotificationType } from '@/lib/notifications/types'

export type NotificationContent = {
  /** `notifications.title` and the email heading. */
  title: string
  /** `notifications.body` and the email intro paragraph. Never null. */
  body: string
  /** `notifications.link_path` and the email CTA target. Never null. */
  linkPath: string
  ctaLabel: string
  emailSubject: string
  details: { label: string; value: string }[]
}

export type NotificationSubject =
  | {
      kind: 'conversation'
      summary: string | null
      outcome: 'successful' | 'failed' | 'unknown'
      durationSeconds: number
      createdAt: string
    }
  | {
      kind: 'appointment'
      /** `appointments.title` — the service booked, not the notification headline. */
      title: string
      clientName: string
      clientPhone: string | null
      startsAt: string
      endsAt: string
    }

const OUTCOME_LABELS: Record<'successful' | 'failed' | 'unknown', string> = {
  successful: 'Successful',
  failed: 'Failed',
  unknown: 'Unknown',
}

/**
 * Pure and synchronous: the whole of a notification's copy, for both the stored
 * row and the email. Every type supplies a title, a body and a link path, which
 * is what lets those three columns be `not null`.
 */
export function buildNotificationContent(input: {
  type: NotificationType
  subject: NotificationSubject
  organizationName: string
  timeZone: string
}): NotificationContent {
  const { type, subject, organizationName, timeZone } = input

  if (type === 'post_call_summary') {
    if (subject.kind !== 'conversation') {
      throw new Error(`[notification] post_call_summary needs a conversation subject`)
    }

    const received = `${formatInTimeZone(subject.createdAt, timeZone, 'date')} at ${formatInTimeZone(
      subject.createdAt,
      timeZone,
      'time'
    )}`
    const body = subject.summary?.trim() || 'No summary was generated for this call.'

    return {
      title: 'Call summary',
      body,
      linkPath: '/conversations',
      ctaLabel: 'View conversations',
      emailSubject: `Call summary — ${organizationName}`,
      details: [
        { label: 'Outcome', value: OUTCOME_LABELS[subject.outcome] ?? 'Unknown' },
        { label: 'Duration', value: formatDuration(subject.durationSeconds) },
        { label: 'Received', value: received },
        { label: 'Summary', value: body },
      ],
    }
  }

  if (subject.kind !== 'appointment') {
    throw new Error(`[notification] ${type} needs an appointment subject`)
  }

  const date = formatInTimeZone(subject.startsAt, timeZone, 'date')
  const startTime = formatInTimeZone(subject.startsAt, timeZone, 'time')
  const endTime = formatInTimeZone(subject.endsAt, timeZone, 'time')
  const body = `${subject.clientName} · ${date} at ${startTime}`
  const baseDetails = [
    { label: 'Client', value: subject.clientName },
    { label: 'Phone', value: subject.clientPhone?.trim() || '—' },
    { label: 'Appointment', value: subject.title },
    { label: 'Date', value: date },
    { label: 'Time', value: `${startTime} – ${endTime}` },
  ]

  if (type === 'client_booking') {
    return {
      title: 'New booking',
      body,
      linkPath: '/calendar',
      ctaLabel: 'Open calendar',
      emailSubject: `New booking — ${organizationName}`,
      details: baseDetails,
    }
  }

  if (type === 'staff_booking') {
    return {
      title: 'Booking added',
      body,
      linkPath: '/calendar',
      ctaLabel: 'Open calendar',
      emailSubject: `New booking — ${organizationName}`,
      details: [...baseDetails, { label: 'Source', value: 'Dashboard' }],
    }
  }

  if (type === 'appointment_reminder') {
    return {
      title: 'Appointment reminder',
      body,
      linkPath: '/calendar',
      ctaLabel: 'Open calendar',
      emailSubject: `Reminder: ${subject.title} — ${organizationName}`,
      details: baseDetails,
    }
  }

  // Unreachable once the payload is validated; kept so the exhaustiveness check
  // has a runtime floor.
  throw new Error(`[notification] unsupported notification type: ${String(type)}`)
}

function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
