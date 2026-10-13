'use client'

import { useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { recoveryCodeSchema } from '@/lib/validations/auth'
import { redeemRecoveryCode } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The lost-authenticator path on `/verify`. Same local-state shape and error handling as
// `VerifyCodeForm`; no auto-submit, because a recovery code is single-use and should be sent on
// purpose, not when the tenth character lands.
export function RecoveryCodeForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit() {
    if (isSubmitting) return
    const parsed = recoveryCodeSchema.safeParse({ code })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await redeemRecoveryCode({ code }) // redirects on success
      if (result?.error) setError(result.error)
    } catch (thrown) {
      unstable_rethrow(thrown)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="recovery-code">Recovery code</Label>
        <Input
          id="recovery-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXXX-XXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          maxLength={16}
          disabled={isSubmitting}
          className="font-mono tracking-wider uppercase"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'recovery-code-error' : 'recovery-code-hint'}
        />
        {error ? (
          <p id="recovery-code-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : (
          <p id="recovery-code-hint" className="text-sm text-muted-foreground">
            Using a code turns off two-factor authentication. You can set it up again in settings.
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={code.trim() === '' || isSubmitting}>
        {isSubmitting ? 'Checking…' : 'Use recovery code'}
      </Button>
    </form>
  )
}
