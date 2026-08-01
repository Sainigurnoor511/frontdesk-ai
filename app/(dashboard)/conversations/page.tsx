import { getConversationsForOrg, getCallerMessagesForOrg } from '@/lib/data/conversations'
import { ConversationsClient } from './conversations-client'

export default async function ConversationsPage() {
  const [conversations, messages] = await Promise.all([
    getConversationsForOrg(),
    getCallerMessagesForOrg(),
  ])

  return <ConversationsClient conversations={conversations} messages={messages} />
}
