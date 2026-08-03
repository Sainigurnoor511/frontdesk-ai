import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/data/conversations'

const STATUS_STYLES: Record<Conversation['outcome'], string> = {
  successful: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
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
