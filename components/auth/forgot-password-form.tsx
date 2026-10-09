'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, MailCheck } from 'lucide-react'
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from '@/lib/validations/auth'
import { requestPasswordReset } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group'
import { toast } from 'sonner'

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({ resolver: zodResolver(requestPasswordResetSchema) })

  async function onSubmit(input: RequestPasswordResetInput) {
    const result = await requestPasswordReset(input)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setSentTo(input.email)
  }

  if (sentTo) {
    return (
      <div role="status" className="space-y-2 rounded-lg border p-4 text-center">
        <MailCheck className="mx-auto size-5 text-muted-foreground" />
        <p className="text-sm font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          If an account exists for {sentTo}, a link to reset your password is on its way.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <InputGroup>
          <InputGroupInput id="email" type="email" autoComplete="email" {...register('email')} />
          <InputGroupAddon align="inline-end">
            <Mail />
          </InputGroupAddon>
        </InputGroup>
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}
