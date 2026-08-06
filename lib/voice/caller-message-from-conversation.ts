import type { CallGoal, TranscriptMessage } from '@/lib/data/conversations'

export function shouldCreateCallerMessage(
  outcome: 'successful' | 'failed' | 'unknown',
  callGoals: CallGoal[]
): boolean {
  if (outcome === 'failed') return true
  return callGoals.some((goal) => goal.status === 'failed')
}

export function buildCallerMessageContent(
  summary: string | null | undefined,
  transcript: TranscriptMessage[],
  callGoals: CallGoal[]
): { summary: string; quotedLine: string | null } {
  const failedGoal = callGoals.find((goal) => goal.status === 'failed')
  const lastCallerLine = transcript.filter((line) => line.role === 'caller').at(-1)?.text

  const messageSummary =
    summary?.trim() ||
    failedGoal?.reasoning?.trim() ||
    'The caller asked for something the receptionist could not complete on this call.'

  return {
    summary: messageSummary,
    quotedLine: lastCallerLine?.trim() || null,
  }
}
