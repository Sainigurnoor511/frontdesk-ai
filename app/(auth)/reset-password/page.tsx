import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkRecoveryClaim } from '@/lib/auth/recovery'
import { resolveMfaGateWithUser, MFA_VERIFY_PATH } from '@/lib/auth/mfa'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

function ExpiredPanel({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold">This link has expired</h1>
      <p className="text-sm text-muted-foreground">
        Reset links work once and only for a short time.
      </p>
      <Link
        href={signedIn ? '/settings' : '/forgot-password'}
        className="text-sm underline underline-offset-4"
      >
        {signedIn ? 'Send a reset email from Settings' : 'Request a new link'}
      </Link>
    </div>
  )
}

/**
 * The auth server could not be asked. Not an expired link: the session it created is still good
 * for a few minutes, so reloading this page is the way forward, not a new email.
 *
 * "Try again" is a plain `<a>`, not `<Link>`: a same-route client navigation can be answered from
 * the router cache without re-running this component, so the checks would never be made again.
 * `offerCode` is for a gate that could not be resolved: a user holding a code can still go to the
 * code step, which sends a recovery session back here once it passes.
 */
function RetryPanel({ offerCode = false }: { offerCode?: boolean }) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold">We could not check your reset link</h1>
      <p className="text-sm text-muted-foreground">
        This is usually brief. Your link still works for a few minutes, so try again shortly.
      </p>
      <div className="flex flex-col items-center gap-2">
        <a href="/reset-password" className="text-sm underline underline-offset-4">
          Try again
        </a>
        {offerCode ? (
          <Link
            href={MFA_VERIFY_PATH}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Enter your two-factor code instead
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export default async function ResetPasswordPage() {
  const supabase = await createClient()

  // Same checks `updatePassword` makes, so the form is only offered where it can succeed. The user
  // comes from the gate's own `getUser()`, which classifies a thrown or retryable failure as
  // `indeterminate` instead of crashing the render or calling a valid link expired.
  const claim = await checkRecoveryClaim(supabase)
  const { gate: mfa, user } = await resolveMfaGateWithUser(supabase)

  if (claim.status === 'unverifiable') return <RetryPanel />
  // Only a positively absent session or a claim that verified as absent is an expired link.
  if (mfa.state === 'unauthenticated') return <ExpiredPanel signedIn={false} />
  if (claim.status === 'absent') return <ExpiredPanel signedIn={Boolean(user)} />

  // This path is gate-exempt so the reset flow works, but a recovery session that still owes its
  // code cannot change the password (Supabase requires aal2 once MFA is on). The code step sends
  // it back here when it passes. An unsupported factor goes there too, because /verify explains
  // it. Any other indeterminate gate is a check that could not be made: /callback sends that here
  // rather than to /verify, so it is resolved again on every load and gets a retry, not a dead end.
  if (mfa.state === 'pending' || (mfa.state === 'indeterminate' && mfa.reason === 'unsupported_factor')) {
    redirect(MFA_VERIFY_PATH)
  }
  if (mfa.state === 'indeterminate' || !user) return <RetryPanel offerCode />

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">For {user.email}</p>
      </div>
      <ResetPasswordForm />
    </div>
  )
}

export const metadata = { title: 'Choose a new password' }
