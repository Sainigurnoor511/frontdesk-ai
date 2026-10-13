import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecentNotifications, getUnreadNotificationCount } from './notifications'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function chain(result: unknown) {
  const node: Record<string, unknown> = {}
  for (const key of ['select', 'eq', 'is', 'order', 'limit']) {
    node[key] = vi.fn(() => node)
  }
  node.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return node
}

async function mockClient(result: unknown) {
  const { createClient } = await import('@/lib/supabase/server')
  const node = chain(result)
  const from = vi.fn(() => node)
  vi.mocked(createClient).mockResolvedValue({ from } as never)
  return { from, node }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getRecentNotifications', () => {
  it('scopes the read to the organization and maps rows', async () => {
    const { from, node } = await mockClient({
      data: [
        {
          id: 'notif-1',
          type: 'client_booking',
          title: 'New booking',
          body: 'Ada · Monday',
          link_path: '/calendar',
          is_read: false,
          created_at: '2026-08-03T18:00:00+00:00',
        },
      ],
      error: null,
    })

    const result = await getRecentNotifications('org-1')

    expect(from).toHaveBeenCalledWith('notifications')
    expect(node.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(node.limit).toHaveBeenCalledWith(10)
    // A reminder for an appointment's earlier time is never listed.
    expect(node.is).toHaveBeenCalledWith('superseded_at', null)
    expect(result).toEqual([
      {
        id: 'notif-1',
        type: 'client_booking',
        title: 'New booking',
        body: 'Ada · Monday',
        linkPath: '/calendar',
        isRead: false,
        createdAt: '2026-08-03T18:00:00+00:00',
      },
    ])
  })

  it('degrades to an empty list when the query errors', async () => {
    await mockClient({ data: null, error: { message: 'relation does not exist' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getRecentNotifications('org-1')).resolves.toEqual([])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('getUnreadNotificationCount', () => {
  it('counts unread rows for the organization', async () => {
    const { node } = await mockClient({ count: 3, error: null })

    await expect(getUnreadNotificationCount('org-1')).resolves.toBe(3)
    expect(node.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(node.eq).toHaveBeenCalledWith('is_read', false)
    expect(node.is).toHaveBeenCalledWith('superseded_at', null)
  })

  it('degrades to zero when the query errors', async () => {
    await mockClient({ count: null, error: { message: 'boom' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getUnreadNotificationCount('org-1')).resolves.toBe(0)
    error.mockRestore()
  })
})
