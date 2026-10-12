import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAnalyticsForRange } from './actions'

vi.mock('@/lib/data/organization', () => ({ getCurrentOrgAndUser: vi.fn() }))
vi.mock('@/lib/data/analytics', () => ({
  getOverviewMetrics: vi.fn(),
  getCallStats: vi.fn(),
  getCallVolumeByDay: vi.fn(),
  getConversionRate: vi.fn(),
  getClientStats: vi.fn(),
  getBookingCountsByService: vi.fn(),
  getBookingCountsByStaff: vi.fn(),
  getDateRange: vi.fn(() => ({ startDate: '2026-01-01', endDate: '2026-01-31' })),
}))

describe('getAnalyticsForRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // The server-action half of the gate: a pending-MFA session makes getCurrentOrgAndUser return
  // null, and this org-scoped action refuses rather than serving organization data.
  it('refuses a session that has not satisfied its assurance level', async () => {
    const { getCurrentOrgAndUser } = await import('@/lib/data/organization')
    const { getOverviewMetrics } = await import('@/lib/data/analytics')
    vi.mocked(getCurrentOrgAndUser).mockResolvedValue(null)

    const result = await getAnalyticsForRange('30d')

    expect(result).toEqual({ error: 'You must be signed in to view analytics.' })
    expect(getOverviewMetrics).not.toHaveBeenCalled()
  })
})
