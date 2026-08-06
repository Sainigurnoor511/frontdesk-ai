import Groq from 'groq-sdk'
import type { TranscriptMessage } from '@/lib/data/conversations'

function formatTranscriptForPrompt(transcript: TranscriptMessage[]): string {
  return transcript
    .map((message) => {
      const speaker = message.role === 'caller' ? 'Caller' : 'Agent'
      return `${speaker}: ${message.text}`
    })
    .join('\n')
}

/**
 * Generates a short post-call summary from a persisted transcript. Safe to call
 * from the voice worker (no Next.js server imports).
 */
export async function generateCallSummary(
  transcript: TranscriptMessage[],
  context?: { businessName?: string | null }
): Promise<string | null> {
  if (transcript.length === 0) return null

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.warn('[generateCallSummary] GROQ_API_KEY is not set; skipping summary generation')
    return null
  }

  const client = new Groq({ apiKey })
  const businessLabel = context?.businessName?.trim() || 'the business'

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `You summarize inbound phone receptionist calls for ${businessLabel}. Write 2-4 concise sentences covering: why the caller contacted the business, what happened on the call, and the outcome (e.g. appointment booked, question answered, callback needed, unresolved). Do not invent details that are not in the transcript.`,
      },
      {
        role: 'user',
        content: formatTranscriptForPrompt(transcript),
      },
    ],
  })

  const summary = response.choices[0]?.message?.content?.trim()
  return summary || null
}
