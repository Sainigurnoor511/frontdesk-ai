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
