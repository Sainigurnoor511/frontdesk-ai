import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/recovery'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const cookieStore = await cookies()

  if (!user || !cookieStore.has(PASSWORD_RECOVERY_COOKIE)) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">This link has expired</h1>
        <p className="text-sm text-muted-foreground">
          Reset links work once and only for a short time.
        </p>
        <Link
          href={user ? '/settings' : '/forgot-password'}
          className="text-sm underline underline-offset-4"
        >
          {user ? 'Send a reset email from Settings' : 'Request a new link'}
        </Link>
      </div>
    )
  }

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
