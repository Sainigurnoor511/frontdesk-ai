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

// Composed by the root layout's title template into "Sign in · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Sign in' }
