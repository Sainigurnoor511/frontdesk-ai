import { getConversationsForOrg, getCallerMessagesForOrg } from '@/lib/data/conversations'
import { ConversationsClient } from './conversations-client'

export default async function ConversationsPage() {
  const [conversations, messages] = await Promise.all([
    getConversationsForOrg(),
    getCallerMessagesForOrg(),
  ])

  return <ConversationsClient conversations={conversations} messages={messages} />
}

// Composed by the root layout's title template into "Conversations · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Conversations' }
