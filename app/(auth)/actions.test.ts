import { describe, it, expect, vi } from 'vitest'
import { signUp, updateOrganizationName } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

describe('signUp', () => {
  it('returns validation error for invalid email', async () => {
    const result = await signUp({
      email: 'not-an-email',
      password: 'password123',
    })
    expect(result).toEqual({ error: 'Enter a valid email address' })
  })
})

describe('updateOrganizationName', () => {
  it('returns validation error for empty name', async () => {
    const result = await updateOrganizationName('org-id', { name: '' })
    expect(result).toEqual({ error: 'Organization name is required' })
  })
})
