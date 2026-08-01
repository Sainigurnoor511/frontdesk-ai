'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Eye, EyeOff } from 'lucide-react'
import { signupSchema, type SignupInput } from '@/lib/validations/auth'
import { signUp } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import { toast } from 'sonner'

export function SignupForm() {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) })

  async function onSubmit(input: SignupInput) {
    const result = await signUp(input)
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
            <Mail />
          </InputGroupAddon>
        </InputGroup>
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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
              {showPassword ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing up…' : 'Sign up'}
      </Button>
    </form>
  )
}
