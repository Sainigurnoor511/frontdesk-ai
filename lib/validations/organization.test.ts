import { describe, it, expect } from 'vitest'
import { organizationNameSchema } from './organization'

describe('organizationNameSchema', () => {
  it('accepts a valid name', () => {
    expect(organizationNameSchema.safeParse({ name: 'Acme Dental' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(organizationNameSchema.safeParse({ name: '' }).success).toBe(false)
  })
})
