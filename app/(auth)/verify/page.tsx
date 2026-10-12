import { redirect } from 'next/navigation'
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
