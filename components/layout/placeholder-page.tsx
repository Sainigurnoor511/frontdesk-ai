import type { Icon } from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'

export function PlaceholderPage({
  title,
  icon: IconComponent,
  description,
}: {
  title: string
  icon: Icon
  description: string
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <IconComponent className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Coming soon</p>
          <p className="text-sm text-muted-foreground">This feature is on the way.</p>
        </CardContent>
      </Card>
    </div>
  )
}
