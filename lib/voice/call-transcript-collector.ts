import * as agents from '@livekit/agents'
import type { TranscriptMessage } from '@/lib/data/conversations'

export function mapChatRoleToTranscriptRole(
  role: string
): TranscriptMessage['role'] | null {
  if (role === 'user') return 'caller'
  if (role === 'assistant') return 'agent'
  return null
}

export function buildTranscriptMessage(
  role: TranscriptMessage['role'],
  text: string,
  eventCreatedAtMs: number,
  callStartedAtMs: number
): TranscriptMessage {
  return {
    role,
    text,
    timestampSeconds: Math.max(0, Math.round((eventCreatedAtMs - callStartedAtMs) / 1000)),
  }
}

/**
 * Collects committed chat turns from a LiveKit AgentSession into the app's
 * `conversations.transcript` JSON shape.
 */
export class CallTranscriptCollector {
  private readonly messages: TranscriptMessage[] = []

  constructor(private readonly callStartedAtMs: number) {}

  attach(session: agents.AgentSession): void {
    session.on(agents.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      if (!(event.item instanceof agents.llm.ChatMessage)) return

      const transcriptRole = mapChatRoleToTranscriptRole(event.item.role)
      if (!transcriptRole) return

      const text = event.item.textContent?.trim()
      if (!text) return

      this.messages.push(
        buildTranscriptMessage(transcriptRole, text, event.createdAt, this.callStartedAtMs)
      )
    })
  }

  getMessages(): TranscriptMessage[] {
    return [...this.messages]
  }
}
