import { describe, it, expect, vi } from 'vitest'
import { getClientsForOrg } from './clients'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

describe('getClientsForOrg', () => {
  it('returns an empty array when no user is signed in', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never)

    const result = await getClientsForOrg()
    expect(result).toEqual([])
  })

  it('returns an empty array when the user has no organization', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const single = vi.fn().mockResolvedValue({ data: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from,
    } as never)

    const result = await getClientsForOrg()
    expect(result).toEqual([])
  })
})
