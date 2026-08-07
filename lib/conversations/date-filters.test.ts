import { describe, it, expect } from 'vitest'
import {
  getConversationLocalDate,
  isOnOrAfterFilterDate,
  isOnOrBeforeFilterDate,
  parseFilterDateInput,
} from './date-filters'

describe('conversation date filters', () => {
  it('parses date input in local time', () => {
    const date = parseFilterDateInput('2026-08-06')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(7)
    expect(date.getDate()).toBe(6)
  })

  it('filters on or after a date', () => {
    expect(isOnOrAfterFilterDate('2026-08-06T12:00:00.000Z', '2026-08-06')).toBe(true)
    expect(isOnOrAfterFilterDate('2026-08-05T12:00:00.000Z', '2026-08-06')).toBe(false)
  })

  it('filters on or before a date', () => {
    expect(isOnOrBeforeFilterDate('2026-08-06T12:00:00.000Z', '2026-08-06')).toBe(true)
    expect(isOnOrBeforeFilterDate('2026-08-07T12:00:00.000Z', '2026-08-06')).toBe(false)
  })

  it('normalizes conversation timestamps to local calendar dates', () => {
    const local = getConversationLocalDate('2026-08-06T23:30:00.000Z')
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(7)
  })
})
