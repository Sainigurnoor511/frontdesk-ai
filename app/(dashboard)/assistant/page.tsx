import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { loadAssistantChatsForUser } from '@/lib/data/assistant-chats'
import { AssistantClient } from './assistant-client'

export default async function AssistantPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const { chats: initialChats, tableMissing } = await loadAssistantChatsForUser(context.user.id)

  return (
    <AssistantClient initialChats={initialChats} migrationRequired={tableMissing} />
  )
}

// Composed by the root layout's title template into "Assistant · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Assistant' }
