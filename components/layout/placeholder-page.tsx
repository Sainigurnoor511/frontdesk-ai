import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

export function PlaceholderPage({
  title,
  icon: IconComponent,
  description,
}: {
  title: string
  icon: LucideIcon
  description: string
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconComponent />
              </EmptyMedia>
              <EmptyTitle>Coming soon</EmptyTitle>
              <EmptyDescription>This feature is on the way.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
