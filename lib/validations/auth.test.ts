import { describe, it, expect } from 'vitest'
import { signupSchema, loginSchema, totpCodeSchema } from './auth'

describe('signupSchema', () => {
  it('accepts valid signup input', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects short password', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
    })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts valid login input', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'anything',
    })
    expect(result.success).toBe(true)
  })
})

describe('totpCodeSchema', () => {
  const message = 'Enter the 6-digit code from your authenticator app'

  it('accepts a 6-digit code', () => {
    const result = totpCodeSchema.safeParse({ code: '123456' })
    expect(result.success).toBe(true)
  })

  it('trims whitespace before checking the pattern', () => {
    const result = totpCodeSchema.safeParse({ code: '  123456 ' })
    expect(result.success).toBe(true)
    expect(result.success && result.data.code).toBe('123456')
  })

  it.each([
    ['empty', ''],
    ['5 digits', '12345'],
    ['7 digits', '1234567'],
    ['non-numeric', '12a456'],
    ['spaced out', '123 456'],
  ])('rejects %s with a single field message', (_label, code) => {
    const result = totpCodeSchema.safeParse({ code })
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0].message).toBe(message)
  })

  it('rejects a missing code', () => {
    const result = totpCodeSchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0].message).toBe(message)
  })
})
