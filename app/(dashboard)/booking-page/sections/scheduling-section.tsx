import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function SchedulingSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Scheduling rules</h2>
        <p className="text-sm text-muted-foreground">
          Business hours, staff hours, exceptions, and time off — the rules that determine which slots
          show up on your public booking page.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <CalendarClock className="size-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Manage scheduling rules</p>
            <p className="text-sm text-muted-foreground">
              Weekly hours, closures, and time off are managed on the Availability page.
            </p>
          </div>
          <Button nativeButton={false} render={<Link href="/availability" />}>
            Open Availability
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
