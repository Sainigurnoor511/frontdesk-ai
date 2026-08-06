import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BookingSection, SettingsCard } from '../section-layout'

export function SchedulingSection() {
  return (
    <BookingSection>
      <SettingsCard
        title="Scheduling rules"
        description="Business hours, staff hours, exceptions, and time off — the rules that determine which slots show up on your public booking page."
        contentClassName="flex items-center gap-4 p-4"
      >
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
      </SettingsCard>
    </BookingSection>
  )
}
