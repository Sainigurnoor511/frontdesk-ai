import Link from 'next/link'
import { Separator } from '@/components/ui/separator'
import { SignupForm } from '@/components/auth/signup-form'
import { GoogleButton } from '@/components/auth/google-button'

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-2xl font-semibold">Create an account</h1>
      <div className="space-y-4">
        <GoogleButton label="Sign up with Google" />
        <Separator />
        <SignupForm />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}

// Composed by the root layout's title template into "Create an account · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Create an account' }
