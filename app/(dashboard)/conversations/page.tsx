import { ChatCircle } from '@phosphor-icons/react/dist/ssr'
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export default function ConversationsPage() {
  return (
    <PlaceholderPage
      title="Conversations"
      icon={ChatCircle}
      description="Review call transcripts and summaries."
    />
  )
}
