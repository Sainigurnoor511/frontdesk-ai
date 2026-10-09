import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/data/conversations'

const STATUS_STYLES: Record<Conversation['outcome'], string> = {
  successful: 'bg-success-subtle text-success',
  failed: 'bg-danger-subtle text-danger',
  unknown: 'bg-muted text-muted-foreground',
}

const STATUS_LABELS: Record<Conversation['outcome'], string> = {
  successful: 'Successful',
  failed: 'Failed',
  unknown: 'Unknown',
}

export function ConversationStatusBadge({
  outcome,
}: {
  outcome: Conversation['outcome']
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[outcome])}>
      {STATUS_LABELS[outcome]}
    </Badge>
  )
}
