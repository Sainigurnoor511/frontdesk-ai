import { createCallerMessageServiceRole } from '@/lib/data/conversations-service'
import { dispatchWebhook } from '@/lib/integrations/webhook'
import {
  CALLBACK_DIGIT_BOUNDS,
  countCallbackDigits,
  takeMessageSchema,
  type CallerMessageUrgency,
} from '@/lib/validations/caller-message'
import { defineVoiceTool, type VoiceToolContext, type VoiceToolHandler } from './types'

/**
 * What the agent tells the caller to expect, keyed off the urgency the caller
 * themselves expressed.
 *
 * Deliberately vague about clock time. Nothing in this repo knows when a human
 * will actually look at the Messages tab — there is no on-call rota, no SLA
 * field, and no staff presence signal — so a spoken "within an hour" would be a
 * promise the product cannot keep. "Today" / "next business day" is the most
 * specific thing that is still true.
 */
const CALLBACK_WINDOW: Record<CallerMessageUrgency, string> = {
  high: 'as soon as someone is free today',
  normal: 'by the end of the next business day',
  low: 'when the team next works through their messages',
}

/**
 * Takes a message for a human and hands the caller a spoken confirmation.
 *
 * This is the honest half of "handoff to a human". The UI already advertises
 * transfers — the Transfer rules section in the agent detail page, and the
 * "Handoff to a human" rule card — and `agent_rules` reach the model as free
 * prose through `buildSystemPrompt`, so the model could already *say* it would
 * pass the caller to a person. It had no tool to do anything about it. Actual
 * call transfer needs a PSTN leg this product does not have (no LiveKit SIP
 * trunk, no outbound dialling, every call is a browser WebRTC session), which
 * is tracked under the telephony work. Taking a message needs none of that.
 *
 * Writes to `caller_messages` rather than a new table: that is the existing
 * inbox. The Messages tab on `/conversations` renders it, the sidebar unread
 * badge counts it, `markMessageAsRead` / `deleteMessage` /
 * `createContactFromMessage` already act on it, and `conversation_id` ties the
 * row back to the call it came from so a human can hear the recording. A
 * separate `escalations` table would be a second inbox nobody opens.
 *
 * Notification uses `dispatchWebhook`, the only org-wide delivery path that
 * exists today — it respects the org's webhook subscription and silently does
 * nothing when the org has not configured one. That is the gap: an org with no
 * webhook learns about the message only by visiting the dashboard. When the
 * notification-delivery work lands (`organization_settings` prefs → queue →
 * email), this call site should gain a `dispatchNotification()` alongside the
 * webhook, not instead of it. Backlogged in `developer-docs/TODO.md`.
 */
function buildTakeMessage(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'take_message',
    description:
      "Take a message for a human to follow up on, and tell the caller when to expect a call back. Use this whenever the caller asks to speak to a person, a manager, or the owner, asks to be transferred, or is unhappy with what you can do — and whenever you cannot help with what they need (no appointment fits, the knowledge base has no answer, or they are asking about something outside your remit). You cannot transfer or connect a live call, so this is how a caller reaches a human: never tell a caller you are putting them through or connecting them. Before calling, ask for and confirm their name and a callback number, spelling the number back digit by digit, and summarize what they need. Returns a confirmation to read back to the caller.",
    parameters: takeMessageSchema,
    execute: async (args) => {
      // Cross-field and normalization checks live here, not in the schema: a
      // `.refine()` would make `parameters` a `ZodEffects`, which
      // `defineVoiceTool`, `@livekit/agents`' `tool()`, and the AssemblyAI
      // JSON-Schema conversion all reject.
      const digits = countCallbackDigits(args.callbackNumber)
      if (digits < CALLBACK_DIGIT_BOUNDS.min || digits > CALLBACK_DIGIT_BOUNDS.max) {
        // A mistranscribed number is the one failure that makes the whole
        // message worthless, so it is worth one more turn with the caller
        // instead of a stored row nobody can dial.
        return { error: 'invalid_callback_number' }
      }

      try {
        const message = await createCallerMessageServiceRole({
          // Org and conversation come from the server-resolved context. There is
          // no organization argument on this tool for a model to supply.
          organizationId: context.organizationId,
          conversationId: context.conversationId,
          callerName: args.callerName,
          callerPhone: args.callbackNumber,
          summary: args.reason,
          quotedLine: args.quotedLine ?? null,
          urgency: args.urgency,
          source: 'agent_escalation',
        })

        // Caught separately, the same way `book_appointment` treats its
        // confirmation email: the message is already committed, so a failed
        // notification must not come back to the caller as "I could not take
        // your message". `dispatchWebhook` swallows its own errors today, but
        // this does not depend on that staying true.
        try {
          await dispatchWebhook(context.organizationId, 'caller_message.created', {
            messageId: message.id,
            conversationId: context.conversationId,
            agentId: context.agentId,
            callerName: args.callerName,
            callbackNumber: args.callbackNumber,
            reason: args.reason,
            urgency: args.urgency,
          })
        } catch (notifyError) {
          console.error(
            `[escalation-tools] notification dispatch failed for caller message ${message.id}:`,
            notifyError
          )
        }

        const window = CALLBACK_WINDOW[args.urgency]
        return {
          success: true,
          messageId: message.id,
          urgency: args.urgency,
          // Read back verbatim-ish: it names the caller, the number on file, and
          // the window, which is everything the caller needs to trust that the
          // request did not evaporate when the call ended.
          spokenConfirmation: `I have taken a message for the team: ${args.reason} They have your name, ${args.callerName}, and your number, ${args.callbackNumber}. Someone will call you back ${window}.`,
        }
      } catch (error) {
        console.error('[escalation-tools] take_message failed:', error)
        return { error: 'message_failed' }
      }
    },
  })
}

/**
 * Escalation capabilities. Not gated on `secure_mode` or
 * `identity_verification_enabled`: taking a message discloses nothing about an
 * existing client and writes nothing a caller could read back out, and the
 * secure-mode paragraph in `buildSystemPrompt` already tells those agents to
 * "offer to take a message for the team" — which is exactly the sentence this
 * tool makes true.
 */
export function buildEscalationToolHandlers(context: VoiceToolContext): VoiceToolHandler[] {
  return [buildTakeMessage(context)]
}
