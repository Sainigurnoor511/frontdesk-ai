import { Resend } from 'resend'

type SendMfaRecoveryNoticeInput = {
  to: string
  /** When the recovery code was redeemed. */
  usedAt: Date
}

/**
 * Tells the account owner that a recovery code was used and two-factor was removed. Throws on
 * failure; the caller (`redeemRecoveryCode`) catches and logs it, so a failed email never blocks
 * or undoes a recovery that has already happened.
 */
export async function sendMfaRecoveryNotice(input: SendMfaRecoveryNoticeInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    throw new Error('Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)')
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: 'A recovery code was used on your Frontdesk.ai account',
    html: buildNoticeHtml(input.usedAt),
  })

  if (error) {
    throw new Error(`Failed to send recovery notice: ${error.message}`)
  }
}

function buildNoticeHtml(usedAt: Date): string {
  // UTC with the zone spelled out: the server has no idea which timezone the reader is in.
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(usedAt)

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
      <h1 style="font-size: 20px; margin: 24px 0 16px;">A recovery code was used</h1>
      <p style="font-size: 15px; line-height: 1.6;">
        Someone signed in to your Frontdesk.ai account with a recovery code on ${when} UTC.
        Two-factor authentication has been removed from the account and your other sessions were
        signed out.
      </p>
      <p style="font-size: 15px; line-height: 1.6;">
        If this was you, set up two-factor authentication again in your account settings.
      </p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        If it was not you, reset your password now and set up two-factor authentication again.
      </p>
    </div>
  `
}
