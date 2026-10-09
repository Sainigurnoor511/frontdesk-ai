import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background p-4">
      <Link href="/" aria-label="Frontdesk.ai">
        <Logo className="h-10 w-auto" />
      </Link>
      <div className="w-full max-w-xs">{children}</div>
    </main>
  )
}
