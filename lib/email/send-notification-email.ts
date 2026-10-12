import { Resend } from 'resend'
import { escapeHtml } from '@/lib/email/html'
import { absoluteUrl } from '@/lib/seo/site'

export type NotificationEmail = {
  organizationName: string
  subject: string
  heading: string
  intro: string
  details: { label: string; value: string }[]
  ctaPath: string
  ctaLabel: string
}

export type BatchSendOutcome =
  /** Accepted. `failedIndices` indexes the submitted `recipients` array. */
  | { status: 'sent'; failedIndices: number[] }
  /** Resend already has this key: the first request landed (or is landing). Do not re-send. */
  | { status: 'already_sent'; message: string }
  /** Transient: 429, 5xx, network. */
  | { status: 'retry'; message: string }
  /** Permanent: quota, auth, validation. */
  | { status: 'permanent'; message: string }

/**
 * Reusing an idempotency key is not a transient failure — the provider is
 * telling us the send already happened (or is in flight). Releasing the claim
 * and retrying here would hand a second worker a licence to send, and
 * `invalid_idempotent_request` (same key, different payload — our payload is
 * re-derived from live data on every attempt) would fail identically on every
 * attempt, so the net result would be no email at all.
 */
const ALREADY_SENT_CODES = new Set(['invalid_idempotent_request', 'concurrent_idempotent_requests'])

/** Retrying these three times, 10 s apart, is pure noise. */
const PERMANENT_CODES = new Set([
  'monthly_quota_exceeded',
  'daily_quota_exceeded',
  'invalid_api_key',
  'restricted_api_key',
  'missing_api_key',
  'validation_error',
  'invalid_from_address',
  'invalid_idempotency_key',
])

/** Throws the standard message when RESEND_API_KEY / RESEND_FROM_EMAIL are missing. */
export function assertResendConfigured(): void {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error('Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)')
  }
}

/**
 * Fans a notification out to every recipient in one `resend.batch.send`
 * request.
 *
 * Each message is an independent envelope, so no member sees another member's
 * address — the property a per-recipient loop existed for — but the job spends
 * one unit against Resend's rate limit instead of `recipients.length`.
 * `batchValidation: 'permissive'` keeps a single unroutable address from
 * rejecting the whole batch.
 *
 * Returns a classified outcome rather than throwing, so the processor can tell
 * "retry" from "already sent" from "stop" (releasing the email claim is only
 * correct for the first).
 */
export async function sendNotificationEmails(
  recipients: string[],
  input: NotificationEmail,
  /** Passed to Resend as `Idempotency-Key`; the notification row id. */
  idempotencyKey: string
): Promise<BatchSendOutcome> {
  assertResendConfigured()
  const from = process.env.RESEND_FROM_EMAIL!
  const html = buildNotificationHtml(input)

  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY!).batch.send(
      recipients.map((to) => ({ from, to, subject: input.subject, html })),
      { batchValidation: 'permissive', idempotencyKey }
    )

    if (error) {
      const message = `Failed to send notification email: ${error.message}`
      if (ALREADY_SENT_CODES.has(error.name)) return { status: 'already_sent', message }
      if (PERMANENT_CODES.has(error.name)) return { status: 'permanent', message }
      return { status: 'retry', message }
    }

    // `errors` only exists under permissive validation, and the SDK derives
    // that header from the option — read it defensively regardless.
    return { status: 'sent', failedIndices: (data?.errors ?? []).map((entry) => entry.index) }
  } catch (error) {
    // Network-level failure: no response to classify, so treat it as transient.
    return {
      status: 'retry',
      message: `Failed to send notification email: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    }
  }
}

/**
 * Hand-built table + inline styles, mirroring `buildConfirmationHtml` in
 * `send-appointment-confirmation.ts`: no external CSS, no `<style>` block, no
 * flexbox, system-font stack. The colour literals are deliberate — email
 * clients have no access to the app's CSS variables.
 */
function buildNotificationHtml(input: NotificationEmail): string {
  const organizationName = escapeHtml(input.organizationName)
  const heading = escapeHtml(input.heading)
  const intro = escapeHtml(input.intro)
  const ctaLabel = escapeHtml(input.ctaLabel)
  const ctaUrl = escapeHtml(absoluteUrl(input.ctaPath))

  const rows = input.details
    .map((detail, index) => {
      const border = index === input.details.length - 1 ? '' : 'border-bottom: 1px solid #e5e7eb; '
      return `
        <tr>
          <td style="padding: 12px 16px; ${border}color: #6b7280; width: 120px;">${escapeHtml(detail.label)}</td>
          <td style="padding: 12px 16px; ${border}font-weight: 500;">${escapeHtml(detail.value)}</td>
        </tr>`
    })
    .join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
      <p style="margin: 24px 0 8px; font-size: 16px; font-weight: 600;">${organizationName}</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">${heading}</h1>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${intro}</p>
      <table style="border: 1px solid #e5e7eb; border-radius: 8px; border-collapse: separate; border-spacing: 0; width: 100%; margin-bottom: 24px;">${rows}
      </table>
      <p style="margin: 0 0 24px;">
        <a href="${ctaUrl}" style="display: inline-block; padding: 10px 18px; border-radius: 6px; background: #1f2937; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none;">${ctaLabel}</a>
      </p>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">
        You are receiving this because notifications are enabled for ${organizationName}.
      </p>
    </div>
  `
}
