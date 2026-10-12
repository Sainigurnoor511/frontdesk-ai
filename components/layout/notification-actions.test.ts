import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getNotificationPanel,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './notification-actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/data/organization', () => ({
  getCurrentOrgAndUser: vi.fn(),
}))

vi.mock('@/lib/data/notifications', () => ({
  getRecentNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
}))

const NOTIFICATION_ID = '44444444-4444-4444-4444-444444444444'

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  updateError = null as { message: string } | null,
} = {}) {
  const updateEqOrg = vi.fn().mockResolvedValue({ error: updateError })
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg })
  const update = vi.fn().mockReturnValue({ eq: updateEqId })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') return { select: memberSelect }
    if (table === 'notifications') return { update }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
    __mocks: { update, updateEqId, updateEqOrg },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getNotificationPanel', () => {
  it('returns an empty panel when there is no session or membership', async () => {
    const { getCurrentOrgAndUser } = await import('@/lib/data/organization')
    const { getRecentNotifications } = await import('@/lib/data/notifications')
    vi.mocked(getCurrentOrgAndUser).mockResolvedValue(null)

    await expect(getNotificationPanel()).resolves.toEqual({ items: [], unreadCount: 0 })
    expect(getRecentNotifications).not.toHaveBeenCalled()
  })

  it('reads the organization from the session, never from a parameter', async () => {
    const { getCurrentOrgAndUser } = await import('@/lib/data/organization')
    const { getRecentNotifications, getUnreadNotificationCount } = await import(
      '@/lib/data/notifications'
    )
    vi.mocked(getCurrentOrgAndUser).mockResolvedValue({
      user: { id: 'user-1', email: 'owner@example.com', avatarUrl: null },
      org: { id: 'org-1', name: 'Smile Dental' },
      role: 'owner',
    })
    vi.mocked(getRecentNotifications).mockResolvedValue([
      {
        id: NOTIFICATION_ID,
        type: 'client_booking',
        title: 'New booking',
        body: 'Ada · Monday',
        linkPath: '/calendar',
        isRead: false,
        createdAt: '2026-08-03T18:00:00+00:00',
      },
    ])
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(1)

    const panel = await getNotificationPanel()

    expect(getRecentNotifications).toHaveBeenCalledWith('org-1')
    expect(getUnreadNotificationCount).toHaveBeenCalledWith('org-1')
    expect(panel.unreadCount).toBe(1)
    expect(panel.items).toHaveLength(1)
  })
})

describe('markNotificationAsRead', () => {
  it('rejects an invalid id without touching the database', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const result = await markNotificationAsRead('not-a-uuid')

    expect('error' in result).toBe(true)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    await expect(markNotificationAsRead(NOTIFICATION_ID)).resolves.toEqual({
      error: 'You must be signed in to update notifications.',
    })
  })

  it('requires a membership', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase()
    supabase.from = vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) }),
      }),
    })) as never
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    await expect(markNotificationAsRead(NOTIFICATION_ID)).resolves.toEqual({
      error: 'Could not determine organization.',
    })
  })

  it('scopes the update to the id and the caller organization', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await markNotificationAsRead(NOTIFICATION_ID)

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith({ is_read: true })
    expect(supabase.__mocks.updateEqId).toHaveBeenCalledWith('id', NOTIFICATION_ID)
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  it('reports success without changing rows for another organization\'s notification', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    // The org filter matches zero rows: PostgREST reports no error, nothing changes.
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    await expect(markNotificationAsRead(NOTIFICATION_ID)).resolves.toEqual({ success: true })
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  it('reports a query error', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ updateError: { message: 'boom' } }) as never
    )

    await expect(markNotificationAsRead(NOTIFICATION_ID)).resolves.toEqual({
      error: 'Could not update notifications. Please try again.',
    })
  })
})

describe('markAllNotificationsAsRead', () => {
  it('clears unread rows for the caller organization only', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await markAllNotificationsAsRead()

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith({ is_read: true })
    expect(supabase.__mocks.updateEqId).toHaveBeenCalledWith('organization_id', 'org-42')
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('is_read', false)
  })

  it('requires a session', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    await expect(markAllNotificationsAsRead()).resolves.toEqual({
      error: 'You must be signed in to update notifications.',
    })
  })
})
