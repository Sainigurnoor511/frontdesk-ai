import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function BookingSection({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>
}

export function SettingsCard({
  title,
  description,
  children,
  contentClassName,
}: {
  title: string
  description?: string
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="space-y-1 border-b p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className={cn('space-y-4 p-4', contentClassName)}>{children}</div>
      </CardContent>
    </Card>
  )
}
