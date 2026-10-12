import Link from 'next/link'
import { Separator } from '@/components/ui/separator'
import { LoginForm } from '@/components/auth/login-form'
import { GoogleButton } from '@/components/auth/google-button'
import type { PendingSessionEndReason } from '@/app/(auth)/actions'

// The callback and the MFA gate both redirect here with an `?error=` code. Without a reader the
// user is dumped at /login with no explanation, so known codes render a notice above the form
// and unknown ones render nothing. Constraining the map by `PendingSessionEndReason` means a new
// reason without a notice is a typecheck error rather than a silently invisible message.
type LoginNoticeCode =
  | PendingSessionEndReason
  | 'session_expired'
  | 'missing_code'
  | 'oauth_failed'
  | 'org_setup_failed'

const LOGIN_NOTICES = {
  missing_code: { tone: 'danger', text: 'That sign-in link was incomplete. Try again.' },
  oauth_failed: { tone: 'danger', text: 'Google sign-in did not complete. Try again.' },
  org_setup_failed: {
    tone: 'danger',
    text: 'We could not finish setting up your account. Contact support.',
  },
  mfa_unavailable: {
    tone: 'danger',
    text: 'Two-factor sign-in is unavailable right now. Please try again later.',
  },
  mfa_attempts: {
    tone: 'danger',
    text: 'Too many incorrect codes. Sign in again to get a new code prompt.',
  },
  session_expired: { tone: 'danger', text: 'Your sign-in session expired. Please sign in again.' },
  // Cancelling is a deliberate user action, not an error, so it gets the neutral tone.
  mfa_cancelled: { tone: 'neutral', text: "You're signed out. Sign in to continue." },
} as const satisfies Record<LoginNoticeCode, { tone: 'danger' | 'neutral'; text: string }>

function isNoticeCode(value: string | undefined): value is LoginNoticeCode {
  return value !== undefined && value in LOGIN_NOTICES
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const code = Array.isArray(error) ? error[0] : error
  const notice = isNoticeCode(code) ? LOGIN_NOTICES[code] : null

  return (
    <div className="space-y-8">
      <h1 className="text-center text-2xl font-semibold">Welcome back</h1>
      {notice && (
        <p
          role="status"
          className={
            notice.tone === 'danger'
              ? 'rounded bg-danger-subtle p-3 text-sm text-danger'
              : 'rounded bg-muted p-3 text-sm text-muted-foreground'
          }
        >
          {notice.text}
        </p>
      )}
      <div className="space-y-4">
        <GoogleButton label="Sign in with Google" />
        <Separator />
        <LoginForm />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  )
}

// Composed by the root layout's title template into "Sign in · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Sign in' }
