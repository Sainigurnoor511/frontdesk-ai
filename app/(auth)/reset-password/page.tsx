import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { checkRecoveryClaim } from '@/lib/auth/recovery'
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

// A plain <a>, not <Link>: the router cache could skip re-running the server check.
function RetryPanel() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold">We could not check your reset link</h1>
      <p className="text-sm text-muted-foreground">
        This is usually brief. Your link still works for a few minutes, so try again shortly.
      </p>
      <a href="/reset-password" className="text-sm underline underline-offset-4">
        Try again
      </a>
    </div>
  )
}

export default async function ResetPasswordPage() {
  const supabase = await createClient()

  // Same check `updatePassword` makes, so the form is only offered where it can succeed.
  const claim = await checkRecoveryClaim(supabase)
  if (claim.status === 'unverifiable') return <RetryPanel />

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || claim.status !== 'valid') return <ExpiredPanel signedIn={Boolean(user)} />

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
