import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'

export default async function HomePage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {context.org.name}</h1>
      <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your AI receptionist.</p>
    </div>
  )
}
