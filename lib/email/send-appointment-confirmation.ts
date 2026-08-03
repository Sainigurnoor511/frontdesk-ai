import { Resend } from 'resend'

type SendAppointmentConfirmationInput = {
  to: string
  clientName: string
  businessName: string
  startsAt: string
  endsAt: string
}

/**
 * Sends an immediate appointment-confirmation email via Resend. Throws on
 * failure — the caller (`book_appointment`'s `execute`) catches and logs it, so
 * a failed email never fails the already-committed booking.
 */
export async function sendAppointmentConfirmationEmail(
  input: SendAppointmentConfirmationInput
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    throw new Error('Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)')
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `Appointment confirmation — ${input.businessName}`,
    html: buildConfirmationHtml(input),
  })

  if (error) {
    throw new Error(`Failed to send confirmation email: ${error.message}`)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The signed ISO datetimes produced by the LLM carry an explicit offset (e.g.
 * `2026-08-03T14:00:00+05:00` or a trailing `Z`). Format the wall-clock time in
 * *that* offset rather than the worker host's own timezone, so the email shows
 * the time the caller actually agreed to regardless of where the worker runs.
 */
function formatInIsoOffset(iso: string, pattern: 'date' | 'time'): string {
  const match = iso.match(/([+-])(\d{2}):(\d{2})$/)
  const offsetMinutes = match
    ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0

  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(shifted)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''

  if (pattern === 'date') {
    const month = get('month')
    const day = get('day')
    const year = get('year')
    const weekday = get('weekday')
    return `${weekday}, ${month} ${day}, ${year}`
  }

  const hour = get('hour')
  const minute = get('minute')
  const meridiem = get('dayPeriod')
  return `${hour}:${minute} ${meridiem}`
}

function buildConfirmationHtml(input: SendAppointmentConfirmationInput): string {
  const businessName = escapeHtml(input.businessName)
  const clientName = escapeHtml(input.clientName)
  const date = formatInIsoOffset(input.startsAt, 'date')
  const startTime = formatInIsoOffset(input.startsAt, 'time')
  const endTime = formatInIsoOffset(input.endsAt, 'time')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
      <p style="margin: 24px 0 8px; font-size: 16px; font-weight: 600;">${businessName}</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">Appointment confirmation</h1>
      <p style="font-size: 15px; line-height: 1.6;">Hi ${clientName},</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        Your appointment has been booked. Here are the details:
      </p>
      <table style="border: 1px solid #e5e7eb; border-radius: 8px; border-collapse: separate; border-spacing: 0; width: 100%; margin-bottom: 24px;">
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 100px;">Business</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${businessName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Date</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${date}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #6b7280;">Time</td>
          <td style="padding: 12px 16px; font-weight: 500;">${startTime} – ${endTime}</td>
        </tr>
      </table>
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 4px;">
        Need to reschedule or cancel? Call ${businessName}.
      </p>
      <p style="font-size: 15px; line-height: 1.6; margin: 24px 0 0;">— ${businessName}</p>
    </div>
  `
}
