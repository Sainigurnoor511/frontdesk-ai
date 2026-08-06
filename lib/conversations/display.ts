import type { CallGoal, Conversation } from '@/lib/data/conversations'

export function isVoiceConversation(channel: Conversation['channel']): boolean {
  return channel === 'voice_web' || channel === 'phone'
}

export function formatConversationDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (startOfDate.getTime() === startOfToday.getTime()) return `Today, ${time}`
  if (startOfDate.getTime() === startOfYesterday.getTime()) return `Yesterday, ${time}`

  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays >= 2 && diffDays < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
    return `Last ${weekday}, ${time}`
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatChannelLabel(channel: Conversation['channel']): string {
  if (channel === 'voice_web') return 'Voice chat on website'
  if (channel === 'phone') return 'Phone call'
  return 'Text chat on website'
}

export function formatEndedReason(reason: string | null): string {
  if (!reason) return 'Unknown'

  const labels: Record<string, string> = {
    caller_hangup: 'Client ended conversation',
    client_hangup: 'Client ended conversation',
    participant_disconnected: 'Client ended conversation',
    agent_ended: 'Agent ended conversation',
    agent_hangup: 'Agent ended conversation',
    max_duration: 'Reached maximum call duration',
    session_error: 'Session error',
    session_closed_with_error: 'Session error',
    agent_not_found: 'Receptionist unavailable',
    internal_error: 'Session error',
  }

  return labels[reason] ?? reason.replace(/_/g, ' ')
}

export function resolveDisplayCallGoals(conversation: Conversation): CallGoal[] {
  if (conversation.callGoals.length > 0) return conversation.callGoals

  const hasCallerInput = conversation.transcript.some((line) => line.role === 'caller')
  const isBrief =
    conversation.transcript.length <= 1 ||
    conversation.durationSeconds < 15 ||
    !hasCallerInput

  const goalReasoning = isBrief
    ? 'The transcript only contains the agent\'s initial greeting. There is no user input, so the caller\'s goal is unknown, and it\'s impossible to determine if any goal was achieved.'
    : 'The conversation ended before a clear caller goal could be identified or completed.'

  const satisfactionReasoning = isBrief
    ? 'The conversation consists only of the agent\'s greeting. There is no caller response or interaction to assess their satisfaction level.'
    : 'The conversation is too brief to assess caller satisfaction reliably.'

  return [
    { name: 'Caller Goal Achieved', status: 'unknown', reasoning: goalReasoning },
    { name: 'Caller Satisfaction', status: 'unknown', reasoning: satisfactionReasoning },
  ]
}

export function formatTranscriptForCopy(
  transcript: Conversation['transcript'],
  agentName: string
): string {
  return transcript
    .map((line) => {
      const speaker = line.role === 'caller' ? 'Caller' : agentName
      return `${speaker}: ${line.text}`
    })
    .join('\n')
}
