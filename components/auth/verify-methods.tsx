'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { VerifyCodeForm } from '@/components/auth/verify-code-form'
import { RecoveryCodeForm } from '@/components/auth/recovery-code-form'

/**
 * The `/verify` prompt for a pending session: the authenticator code by default, with a switch to
 * a recovery code for someone who has lost their device. Both forms spend the same attempt budget.
 * `children` (the page's cancel form, a plain server-action form) renders below the switch, and
 * never inside either form, because a nested <form> is invalid HTML.
 */
export function VerifyMethods({ email, children }: { email: string; children?: ReactNode }) {
  const [method, setMethod] = useState<'totp' | 'recovery'>('totp')

  return (
    <>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">
          {method === 'totp' ? 'Enter your authentication code' : 'Enter a recovery code'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {method === 'totp'
            ? email
              ? `Open your authenticator app for the 6-digit code for ${email}.`
              : 'Open your authenticator app for the 6-digit code.'
            : 'Enter one of the recovery codes you saved when you set up two-factor authentication.'}
        </p>
      </div>
      <div className="space-y-4">
        {method === 'totp' ? <VerifyCodeForm /> : <RecoveryCodeForm />}
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => setMethod(method === 'totp' ? 'recovery' : 'totp')}
        >
          {method === 'totp' ? 'Use a recovery code instead' : 'Use your authenticator app instead'}
        </Button>
        {children}
      </div>
    </>
  )
}
