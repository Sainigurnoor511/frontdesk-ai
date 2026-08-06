import { describe, it, expect } from 'vitest'
import type { Conversation } from '@/lib/data/conversations'
import {
  formatChannelLabel,
  formatEndedReason,
  isVoiceConversation,
  resolveDisplayCallGoals,
} from './display'

const baseConversation: Conversation = {
  id: 'c1',
  organizationId: 'org1',
  agentId: 'a1',
  channel: 'voice_web',
  outcome: 'unknown',
  category: null,
  summary: 'Test summary',
  durationSeconds: 8,
  endedReason: 'caller_hangup',
  transcript: [
    { role: 'agent', text: 'Hello!', timestampSeconds: 0 },
  ],
  callGoals: [],
  isRead: true,
  createdAt: '2026-08-05T22:17:00.000Z',
  agentName: 'Receptionist',
  roomName: null,
  recordingPath: 'recordings/c1.ogg',
}

describe('isVoiceConversation', () => {
  it('returns true for voice_web and phone', () => {
    expect(isVoiceConversation('voice_web')).toBe(true)
    expect(isVoiceConversation('phone')).toBe(true)
  })

  it('returns false for chat', () => {
    expect(isVoiceConversation('chat')).toBe(false)
  })
})

describe('formatChannelLabel', () => {
  it('maps channels to reception-style labels', () => {
    expect(formatChannelLabel('voice_web')).toBe('Voice chat on website')
    expect(formatChannelLabel('phone')).toBe('Phone call')
    expect(formatChannelLabel('chat')).toBe('Text chat on website')
  })
})

describe('formatEndedReason', () => {
  it('maps known reasons to user-facing labels', () => {
    expect(formatEndedReason('caller_hangup')).toBe('Client ended conversation')
    expect(formatEndedReason(null)).toBe('Unknown')
  })
})

describe('resolveDisplayCallGoals', () => {
  it('returns stored goals when present', () => {
    const withGoals: Conversation = {
      ...baseConversation,
      callGoals: [
        { name: 'Book appointment', status: 'failed', reasoning: 'No slot found.' },
      ],
    }
    expect(resolveDisplayCallGoals(withGoals)).toHaveLength(1)
    expect(resolveDisplayCallGoals(withGoals)[0].name).toBe('Book appointment')
  })

  it('returns default unknown goals for brief conversations', () => {
    const goals = resolveDisplayCallGoals(baseConversation)
    expect(goals).toHaveLength(2)
    expect(goals.every((g) => g.status === 'unknown')).toBe(true)
    expect(goals[0].name).toBe('Caller Goal Achieved')
    expect(goals[1].name).toBe('Caller Satisfaction')
  })
})
