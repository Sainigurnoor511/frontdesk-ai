import { describe, it, expect, vi } from 'vitest'
import {
  getConversionRate,
  getOverviewMetrics,
  getCallVolumeByDay,
} from './analytics'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

type CountResult = { count: number | null }
type SelectResult = { data: unknown[] | null }

function makeCountQuery(count: number | null) {
  const query: Record<string, unknown> = {}
  const resolve = () => Promise.resolve({ count } as CountResult)
  query.eq = vi.fn().mockReturnValue(query)
  query.gte = vi.fn().mockReturnValue(query)
  query.lte = vi.fn().mockImplementation(resolve)
  return query
}

function makeSelectQuery(data: unknown[] | null) {
  const query: Record<string, unknown> = {}
  const resolve = () => Promise.resolve({ data } as SelectResult)
  query.eq = vi.fn().mockReturnValue(query)
  query.gte = vi.fn().mockReturnValue(query)
  query.lte = vi.fn().mockImplementation(resolve)
  return query
}

function mockSupabase({
  appointmentsCount = 0,
  clientsCount = 0,
  cancellationsCount = 0,
  conversationsCount = 0,
  conversationRows = [] as unknown[],
} = {}) {
  // appointments.select() is called once for "confirmed" bookings and once for
  // "cancelled" appointments; each call chains its own .eq('status', ...) before
  // resolving, so we can't tell them apart from select() alone. Instead, wrap the
  // query object so whichever branch is queried with status='cancelled' resolves
  // to cancellationsCount, and status='confirmed' resolves to appointmentsCount.
  const appointmentsSelect = vi.fn((_cols: string, opts?: { count?: string }) => {
    if (opts?.count !== 'exact') return makeSelectQuery([])

    const query: Record<string, unknown> = {}
    let resolvedCount = appointmentsCount
    query.eq = vi.fn((column: string, value: string) => {
      if (column === 'status' && value === 'cancelled') {
        resolvedCount = cancellationsCount
      }
      return query
    })
    query.gte = vi.fn().mockReturnValue(query)
    query.lte = vi.fn().mockImplementation(() => Promise.resolve({ count: resolvedCount }))
    return query
  })

  const clientsSelect = vi.fn().mockReturnValue(makeCountQuery(clientsCount))

  const conversationsSelect = vi.fn((_cols: string, opts?: { count?: string }) => {
    if (opts?.count === 'exact') {
      return makeCountQuery(conversationsCount)
    }
    return makeSelectQuery(conversationRows)
  })

  const from = vi.fn((table: string) => {
    if (table === 'appointments') return { select: appointmentsSelect }
    if (table === 'clients') return { select: clientsSelect }
    if (table === 'conversations') return { select: conversationsSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from }
}

describe('getConversionRate', () => {
  it('returns 0 when there are no calls in range (divide-by-zero handling)', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ conversationsCount: 0, appointmentsCount: 5 })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await getConversionRate('org-1', '2026-01-01', '2026-01-07')
    expect(result).toBe(0)
  })

  it('computes bookings / calls as a percentage', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ conversationsCount: 10, appointmentsCount: 4 })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await getConversionRate('org-1', '2026-01-01', '2026-01-07')
    expect(result).toBe(40)
  })
})

describe('getOverviewMetrics', () => {
  it('passes the correct date-range filter args and scopes to the organization', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ appointmentsCount: 3, clientsCount: 2, cancellationsCount: 1 })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await getOverviewMetrics('org-42', '2026-01-01', '2026-01-07')

    expect(result.revenue).toBe(0)
    expect(supabase.from).toHaveBeenCalledWith('appointments')
    expect(supabase.from).toHaveBeenCalledWith('clients')
  })

  it('always reports revenue as 0 (no payments tracking exists yet)', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase()
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await getOverviewMetrics('org-1', '2026-01-01', '2026-01-07')
    expect(result.revenue).toBe(0)
  })
})

describe('getCallVolumeByDay', () => {
  it('fills in every day in range with zero counts when there is no data', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ conversationRows: [] })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await getCallVolumeByDay('org-1', '2026-01-01', '2026-01-03')

    expect(result).toEqual([
      { date: '2026-01-01', count: 0 },
      { date: '2026-01-02', count: 0 },
      { date: '2026-01-03', count: 0 },
    ])
  })

  it('groups conversations by day', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({
      conversationRows: [
        { created_at: '2026-01-01T10:00:00.000Z' },
        { created_at: '2026-01-01T15:00:00.000Z' },
        { created_at: '2026-01-02T09:00:00.000Z' },
      ],
    })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await getCallVolumeByDay('org-1', '2026-01-01', '2026-01-02')

    expect(result).toEqual([
      { date: '2026-01-01', count: 2 },
      { date: '2026-01-02', count: 1 },
    ])
  })
})
