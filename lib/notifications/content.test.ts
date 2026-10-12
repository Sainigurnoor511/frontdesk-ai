import { describe, it, expect } from 'vitest'
import { buildNotificationContent, type NotificationSubject } from './content'

const conversation: NotificationSubject = {
  kind: 'conversation',
  summary: 'Caller booked a cleaning for Tuesday.',
  outcome: 'successful',
  durationSeconds: 95,
  createdAt: '2026-08-03T18:00:00+00:00',
}

const appointment: NotificationSubject = {
  kind: 'appointment',
  title: 'Teeth cleaning',
  clientName: 'Ada Lovelace',
  clientPhone: '+14155551234',
  startsAt: '2026-08-03T18:00:00+00:00',
  endsAt: '2026-08-03T19:00:00+00:00',
}

describe('buildNotificationContent', () => {
  it('builds the post-call summary', () => {
    const content = buildNotificationContent({
      type: 'post_call_summary',
      subject: conversation,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.title).toBe('Call summary')
    expect(content.body).toBe('Caller booked a cleaning for Tuesday.')
    expect(content.linkPath).toBe('/conversations')
    expect(content.emailSubject).toBe('Call summary — Smile Dental')
    expect(content.details).toEqual(
      expect.arrayContaining([
        { label: 'Outcome', value: 'Successful' },
        { label: 'Duration', value: '1:35' },
      ])
    )
  })

  it('falls back when a call produced no summary', () => {
    const content = buildNotificationContent({
      type: 'post_call_summary',
      subject: { ...conversation, summary: null } as NotificationSubject,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.body).toBe('No summary was generated for this call.')
  })

  it('builds a client booking', () => {
    const content = buildNotificationContent({
      type: 'client_booking',
      subject: appointment,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.title).toBe('New booking')
    expect(content.linkPath).toBe('/calendar')
    expect(content.ctaLabel).toBe('Open calendar')
    expect(content.emailSubject).toBe('New booking — Smile Dental')
    expect(content.details).toEqual(
      expect.arrayContaining([
        { label: 'Client', value: 'Ada Lovelace' },
        { label: 'Phone', value: '+14155551234' },
        { label: 'Appointment', value: 'Teeth cleaning' },
      ])
    )
  })

  it('builds a staff booking with the dashboard source', () => {
    const content = buildNotificationContent({
      type: 'staff_booking',
      subject: appointment,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.title).toBe('Booking added')
    expect(content.details).toEqual(
      expect.arrayContaining([{ label: 'Source', value: 'Dashboard' }])
    )
  })

  it('builds an appointment reminder', () => {
    const content = buildNotificationContent({
      type: 'appointment_reminder',
      subject: appointment,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.title).toBe('Appointment reminder')
    expect(content.emailSubject).toBe('Reminder: Teeth cleaning — Smile Dental')
  })

  it('renders an em dash for a missing phone number', () => {
    const content = buildNotificationContent({
      type: 'client_booking',
      subject: { ...appointment, clientPhone: null } as NotificationSubject,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.details).toEqual(
      expect.arrayContaining([{ label: 'Phone', value: '—' }])
    )
  })

  it('renders wall-clock time in the organization timezone, not UTC', () => {
    // `appointments.starts_at` is timestamptz and comes back from PostgREST as
    // `+00:00`, so a string-offset formatter would render 6:00 PM here.
    const content = buildNotificationContent({
      type: 'client_booking',
      subject: appointment,
      organizationName: 'Smile Dental',
      timeZone: 'America/New_York',
    })

    expect(content.body).toContain('2:00 PM')
    expect(content.body).not.toContain('6:00 PM')
    expect(content.details).toEqual(
      expect.arrayContaining([{ label: 'Time', value: '2:00 PM – 3:00 PM' }])
    )
  })

  it('renders the same instant as 6:00 PM for a UTC organization', () => {
    const content = buildNotificationContent({
      type: 'client_booking',
      subject: appointment,
      organizationName: 'Smile Dental',
      timeZone: 'UTC',
    })

    expect(content.body).toContain('6:00 PM')
  })

  it('falls back to the raw ISO string for an invalid timezone', () => {
    const content = buildNotificationContent({
      type: 'client_booking',
      subject: appointment,
      organizationName: 'Smile Dental',
      timeZone: 'Not/AZone',
    })

    expect(content.body).toContain('2026-08-03T18:00:00+00:00')
  })
})
