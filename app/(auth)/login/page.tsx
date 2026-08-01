import Link from 'next/link'
import { Separator } from '@/components/ui/separator'
import { LoginForm } from '@/components/auth/login-form'
import { GoogleButton } from '@/components/auth/google-button'

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-2xl font-semibold">Welcome back</h1>
      <div className="space-y-4">
        <GoogleButton label="Sign in with Google" />
        <Separator />
        <LoginForm />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  )
}
