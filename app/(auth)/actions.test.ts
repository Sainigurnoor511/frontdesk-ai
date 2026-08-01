import { describe, it, expect, vi } from 'vitest'
import { signUp } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

describe('signUp', () => {
  it('returns validation error for invalid email', async () => {
    const result = await signUp({
      email: 'not-an-email',
      password: 'password123',
      businessName: 'Acme',
    })
    expect(result).toEqual({ error: 'Enter a valid email address' })
  })
})
