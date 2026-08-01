import { describe, it, expect } from 'vitest'
import {
  scanRequestSchema,
  manualBusinessInfoSchema,
  countryLanguageSchema,
  industrySchema,
  callRoutingSchema,
} from './agent'

describe('scanRequestSchema', () => {
  it('accepts a valid URL and depth', () => {
    const result = scanRequestSchema.safeParse({ url: 'https://example.com', scanDepth: 'single' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid URL', () => {
    const result = scanRequestSchema.safeParse({ url: 'not-a-url', scanDepth: 'single' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid scan depth', () => {
    const result = scanRequestSchema.safeParse({ url: 'https://example.com', scanDepth: 'medium' })
    expect(result.success).toBe(false)
  })
})

describe('manualBusinessInfoSchema', () => {
  it('accepts a business name', () => {
    expect(manualBusinessInfoSchema.safeParse({ businessName: 'Acme Dental' }).success).toBe(true)
  })

  it('rejects an empty business name', () => {
    expect(manualBusinessInfoSchema.safeParse({ businessName: '' }).success).toBe(false)
  })
})

describe('countryLanguageSchema', () => {
  it('accepts country and language', () => {
    const result = countryLanguageSchema.safeParse({ country: 'United States', language: 'English' })
    expect(result.success).toBe(true)
  })
})

describe('industrySchema', () => {
  it('accepts an industry', () => {
    expect(industrySchema.safeParse({ industry: 'Dental' }).success).toBe(true)
  })
})

describe('callRoutingSchema', () => {
  it('accepts valid call routing config', () => {
    const result = callRoutingSchema.safeParse({
      answeringMode: 'staff_first',
      staffPhoneNumber: '+15855318253',
      maxRingSeconds: 20,
    })
    expect(result.success).toBe(true)
  })

  it('rejects ring time out of range', () => {
    const result = callRoutingSchema.safeParse({
      answeringMode: 'staff_first',
      staffPhoneNumber: '+15855318253',
      maxRingSeconds: 120,
    })
    expect(result.success).toBe(false)
  })

  it('rejects malformed phone number', () => {
    const result = callRoutingSchema.safeParse({
      answeringMode: 'staff_first',
      staffPhoneNumber: 'abc',
      maxRingSeconds: 20,
    })
    expect(result.success).toBe(false)
  })
})
