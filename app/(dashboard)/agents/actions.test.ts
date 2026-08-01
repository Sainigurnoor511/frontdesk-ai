import { describe, it, expect, vi } from 'vitest'
import { startWebsiteScan } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/queue/queues/scan-website', () => ({
  scanWebsiteQueue: { add: vi.fn() },
}))

describe('startWebsiteScan', () => {
  it('returns a validation error for an invalid URL', async () => {
    const result = await startWebsiteScan({ url: 'not-a-url', scanDepth: 'single' })
    expect(result).toEqual({ error: 'Enter a valid URL' })
  })
})
