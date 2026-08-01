import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { Button } from '@/components/ui/button'
import { logOut } from '@/app/(auth)/actions'

export default async function SettingsPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account.</p>
      </div>
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-medium">Email</p>
        <p className="text-sm text-muted-foreground">{context.user.email}</p>
      </div>
      <form action={logOut}>
        <Button variant="outline" type="submit">
          Log out
        </Button>
      </form>
    </div>
  )
}
