import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { resolveMfaGate, POST_LOGIN_PATH } from '@/lib/auth/mfa'
import { cancelMfaChallenge } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { VerifyCodeForm } from '@/components/auth/verify-code-form'

// The cancel control is a plain server-action form, so it works without JavaScript — it is the
// one control a stuck user must be able to reach. Rendered as a sibling of the code form, never
// nested inside it, because a nested <form> is invalid HTML and breaks submission.
function CancelForm({ label }: { label: string }) {
  return (
    <form action={cancelMfaChallenge}>
      <Button type="submit" variant="ghost" className="w-full">
        {label}
      </Button>
    </form>
  )
}

export default async function VerifyPage() {
  const supabase = await createClient()
  const mfa = await resolveMfaGate(supabase)

  if (mfa.state === 'satisfied') {
    redirect(POST_LOGIN_PATH)
  }
  if (mfa.state === 'unauthenticated') {
    redirect('/login')
  }

  if (mfa.state === 'indeterminate' && mfa.reason === 'unsupported_factor') {
    // Not transient, so "try again" copy would send the user round the loop forever. Say what is
    // wrong and who can fix it: on a self-hosted install that is whoever runs it, using the
    // procedure in developer-docs/ARCHITECTURE.md (Auth Flow, operator recovery).
    return (
      <div className="space-y-4 text-center">
        <ShieldAlert aria-hidden className="mx-auto size-8 text-warning" />
        <h1 className="text-2xl font-semibold">This sign-in method is not supported</h1>
        <p className="text-sm text-muted-foreground">
          Your account uses a two-factor method other than an authenticator app. This app can only
          check authenticator app codes, so signing in again will not help.
        </p>
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
          Ask the person who runs your Frontdesk.ai workspace to remove the other two-factor method
          from your account. Then sign in with your password and set up an authenticator app in
          settings.
        </p>
        <CancelForm label="Sign out" />
      </div>
    )
  }

  if (mfa.state === 'indeterminate') {
    // Terminal panel, no redirect: a Server Component cannot reliably sign out (its cookie
    // writes are swallowed), so bouncing to /login with a live pending session would loop.
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Two-factor sign-in is unavailable</h1>
        <p className="text-sm text-muted-foreground">
          We could not check your two-factor setup. Sign in again to continue.
        </p>
        <CancelForm label="Sign in again" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Enter your authentication code</h1>
        <p className="text-sm text-muted-foreground">
          {mfa.email
            ? `Open your authenticator app for the 6-digit code for ${mfa.email}.`
            : 'Open your authenticator app for the 6-digit code.'}
        </p>
      </div>
      <div className="space-y-4">
        <VerifyCodeForm />
        <CancelForm label="Use a different account" />
      </div>
    </div>
  )
}

export const metadata = { title: 'Enter your authentication code' }
