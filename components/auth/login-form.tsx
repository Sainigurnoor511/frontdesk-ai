'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Envelope, Eye, EyeSlash } from '@phosphor-icons/react/dist/ssr'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { logIn } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import { toast } from 'sonner'

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(input: LoginInput) {
    const result = await logIn(input)
    if (result?.error) {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <InputGroup>
          <InputGroupInput id="email" type="email" {...register('email')} />
          <InputGroupAddon align="inline-end">
            <Envelope />
          </InputGroupAddon>
        </InputGroup>
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a href="#" className="text-xs text-muted-foreground underline underline-offset-4">
            Forgot your password?
          </a>
        </div>
        <InputGroup>
          <InputGroupInput
            id="password"
            type={showPassword ? 'text' : 'password'}
            {...register('password')}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeSlash /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
