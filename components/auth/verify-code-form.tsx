'use client'

import { useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { totpCodeSchema } from '@/lib/validations/auth'
import { verifyMfaChallenge } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

// Local state rather than react-hook-form: one OTP field with an auto-submit does not benefit
// from RHF, and `input-otp` types `onComplete` as `(...args: any[]) => unknown`, so handing it
// RHF's `handleSubmit` would put the code in the event position. Matches the enrollment dialog's
// `enrollCode` / `enrollError` state in `app/(settings)/settings/settings-client.tsx`.
export function VerifyCodeForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(value: string) {
    if (isSubmitting) return // guards auto-submit racing the button click
    const parsed = totpCodeSchema.safeParse({ code: value })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await verifyMfaChallenge(parsed.data) // redirects on success
      if (result?.error) {
        setError(result.error)
        setCode('') // never leave a stale code in the boxes
      }
    } catch (thrown) {
      // A redirect or any other Next control-flow signal must keep propagating, otherwise a
      // successful verification would be reported to the user as a failure.
      unstable_rethrow(thrown)
      // Anything else is the action request itself failing — a dropped connection, an aborted
      // POST, the proxy answering the action with a challenge. Without this the form stayed
      // disabled with no message and only a manual reload recovered.
      setError('Could not reach the server. Check your connection and try again.')
      setCode('')
    } finally {
      // Always re-enable. On the success path the redirect unmounts this form first, so there is
      // nothing to re-enable; on every other path the user needs the input back.
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit(code)
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="code">Authentication code</Label>
        <InputOTP
          maxLength={6}
          id="code"
          value={code}
          onChange={setCode}
          onComplete={(value: string) => void submit(value)}
          // Consumed by `input-otp`, which compiles it into an internal RegExp that rejects
          // non-digit keystrokes and pastes. It is also re-emitted on the real input as
          // pattern="^\d+$" (regexp.source); the keystroke filtering is what matters here.
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={isSubmitting}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'code-error' : undefined}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              // aria-invalid goes on the input (for assistive tech) and on each slot (for the
              // visual): `input-otp` renders the input as a sibling of the group, so
              // `has-aria-invalid:` on the group cannot see it.
              <InputOTPSlot key={index} index={index} aria-invalid={Boolean(error) || undefined} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && (
          <p id="code-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={code.length !== 6 || isSubmitting}>
        {isSubmitting ? 'Verifying…' : 'Verify and sign in'}
      </Button>
    </form>
  )
}
