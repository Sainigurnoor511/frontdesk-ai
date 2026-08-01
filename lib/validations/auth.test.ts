import { describe, it, expect } from 'vitest'
import { signupSchema, loginSchema } from './auth'

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
