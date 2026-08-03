import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center gap-10 p-4">
        <Link
          href="/"
          aria-label="Frontdesk.ai"
          className="font-brand text-5xl"
        >
          Frontdesk.ai
        </Link>
        <div className="w-full max-w-xs">{children}</div>
      </div>
      <footer className="border-t bg-muted/40 py-4 text-center text-xs text-muted-foreground">
        By continuing, you agree to our{' '}
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </footer>
    </div>
  )
}
