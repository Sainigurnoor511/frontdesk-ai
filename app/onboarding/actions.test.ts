import { describe, it, expect, vi } from 'vitest'
import { startWebsiteScan, createAgent } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/queue/queues/scan-website', () => ({
  scanWebsiteQueue: { add: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('startWebsiteScan', () => {
  it('returns a validation error for an invalid URL', async () => {
    const result = await startWebsiteScan({ url: 'not-a-url', scanDepth: 'single' })
    expect(result).toEqual({ error: 'Enter a valid URL' })
  })
})

describe('createAgent', () => {
  it('assigns a language-matched default voice so new agents have a fixed TTS voice', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const insert = vi.fn().mockResolvedValue({ data: { id: 'agent-1' }, error: null })
    const from = vi.fn((table: string) => {
      if (table === 'members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } }),
            }),
          }),
        }
      }
      if (table === 'agents') {
        insert.mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'agent-1' }, error: null }),
          }),
        })
        return { insert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)

    await createAgent({
      businessName: 'Smile Dental',
      country: 'US',
      language: 'English',
      industry: 'Dental',
      answeringMode: 'agent_first',
      staffPhoneNumber: '+15551234567',
      maxRingSeconds: 30,
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ voice_id: '76b55591c758444cb95253708696dfad' })
    )
  })
})
