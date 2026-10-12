import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationCenter } from './notification-center'

// jsdom has no ResizeObserver; the Base UI popover positioner requires one.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
window.HTMLElement.prototype.scrollIntoView = () => {}

vi.mock('./notification-actions', () => ({
  getNotificationPanel: vi.fn(),
  markAllNotificationsAsRead: vi.fn(),
  markNotificationAsRead: vi.fn(),
}))

const ITEMS = [
  {
    id: '44444444-4444-4444-4444-444444444444',
    type: 'client_booking' as const,
    title: 'New booking',
    body: 'Ada Lovelace · Monday, August 3, 2026 at 2:00 PM',
    linkPath: '/calendar',
    isRead: false,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    type: 'post_call_summary' as const,
    title: 'Call summary',
    body: 'Caller asked about opening hours.',
    linkPath: '/conversations',
    isRead: true,
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * The trigger's accessible name carries the unread count, so it is matched by
 * prefix rather than by the bare label.
 */
function notificationBell(): HTMLElement {
  return screen.getByRole('button', { name: /^Notifications/ })
}

describe('NotificationCenter', () => {
  it('lists notifications with unread state and an unread count', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })

    render(<NotificationCenter initialUnreadCount={1} />)

    expect(screen.getByText('1 unread')).toBeTruthy()
    fireEvent.click(notificationBell())

    expect(await screen.findByText('New booking')).toBeTruthy()
    expect(screen.getByText('Call summary')).toBeTruthy()
    const unreadRows = document.querySelectorAll('[data-unread="true"]')
    expect(unreadRows).toHaveLength(1)
  })

  it('renders the empty state and disables mark-all when there is nothing', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: [], unreadCount: 0 })

    render(<NotificationCenter initialUnreadCount={0} />)
    fireEvent.click(notificationBell())

    expect(await screen.findByText('No notifications yet.')).toBeTruthy()
    expect(screen.getByText('Call summaries and booking alerts show up here.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('marks everything read and clears the badge', async () => {
    const { getNotificationPanel, markAllNotificationsAsRead } = await import(
      './notification-actions'
    )
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })
    vi.mocked(markAllNotificationsAsRead).mockResolvedValue({ success: true })

    render(<NotificationCenter initialUnreadCount={1} />)
    fireEvent.click(notificationBell())
    await screen.findByText('New booking')

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

    await waitFor(() => expect(markAllNotificationsAsRead).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('0 unread')).toBeTruthy())
    expect(document.querySelectorAll('[data-unread="true"]')).toHaveLength(0)
  })

  it('marks a clicked row read and decrements the badge', async () => {
    const { getNotificationPanel, markNotificationAsRead } = await import(
      './notification-actions'
    )
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })
    vi.mocked(markNotificationAsRead).mockResolvedValue({ success: true })

    render(<NotificationCenter initialUnreadCount={1} />)
    fireEvent.click(notificationBell())
    fireEvent.click(await screen.findByText('New booking'))

    expect(markNotificationAsRead).toHaveBeenCalledWith(ITEMS[0].id)
    await waitFor(() => expect(screen.getByText('0 unread')).toBeTruthy())
  })

  it('clears the loader and keeps the header usable when the panel read rejects', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockRejectedValue(new Error('offline'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<NotificationCenter initialUnreadCount={0} />)
    fireEvent.click(notificationBell())

    expect(await screen.findByText('No notifications yet.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('fetches once on mount when the header cannot supply a count', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 2 })

    render(<NotificationCenter />)

    await waitFor(() => expect(getNotificationPanel).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('2 unread')).toBeTruthy())
  })

  it('shows the rows as read when the panel is reopened after a mark-all', async () => {
    const { getNotificationPanel, markAllNotificationsAsRead } = await import(
      './notification-actions'
    )
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })
    vi.mocked(markAllNotificationsAsRead).mockResolvedValue({ success: true })

    render(<NotificationCenter initialUnreadCount={1} />)
    fireEvent.click(notificationBell())
    await screen.findByText('New booking')
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(screen.getByText('0 unread')).toBeTruthy())

    // Close, then reopen: the reopen refetch is authoritative, so the server
    // view is what shows — not the stale unread list from the first fetch.
    fireEvent.click(notificationBell())
    vi.mocked(getNotificationPanel).mockResolvedValue({
      items: ITEMS.map((item) => ({ ...item, isRead: true })),
      unreadCount: 0,
    })
    fireEvent.click(notificationBell())

    await waitFor(() =>
      expect(document.querySelectorAll('[data-unread="true"]')).toHaveLength(0)
    )
    expect(screen.getByText('0 unread')).toBeTruthy()
  })

  it('names the unread count in the trigger accessible name', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 3 })

    render(<NotificationCenter initialUnreadCount={3} />)

    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy()
  })

  // Issue 8: both mutations return expected failures as `{ error }` rather than
  // rejecting, so the optimistic update has to inspect the resolved value.
  it('rolls the row and the badge back when marking one read resolves with an error', async () => {
    const { getNotificationPanel, markNotificationAsRead } = await import(
      './notification-actions'
    )
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })
    vi.mocked(markNotificationAsRead).mockResolvedValue({ error: 'Could not update.' })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<NotificationCenter initialUnreadCount={1} />)
    fireEvent.click(notificationBell())
    fireEvent.click(await screen.findByText('New booking'))

    await waitFor(() => expect(screen.getByText('1 unread')).toBeTruthy())
    expect(document.querySelectorAll('[data-unread="true"]')).toHaveLength(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not update.'))
    error.mockRestore()
  })

  it('restores every unread row when mark-all resolves with an error', async () => {
    const { getNotificationPanel, markAllNotificationsAsRead } = await import(
      './notification-actions'
    )
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })
    vi.mocked(markAllNotificationsAsRead).mockResolvedValue({ error: 'Could not update.' })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<NotificationCenter initialUnreadCount={1} />)
    fireEvent.click(notificationBell())
    await screen.findByText('New booking')

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

    await waitFor(() => expect(screen.getByText('1 unread')).toBeTruthy())
    expect(document.querySelectorAll('[data-unread="true"]')).toHaveLength(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not update.'))
    error.mockRestore()
  })

  // Issue 3, render side: a forged or corrupted `link_path` must not become an
  // off-origin call to action inside the app's own UI.
  it('sends an off-origin link_path to the fallback route', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({
      items: [{ ...ITEMS[0], linkPath: 'https://evil.example/phish' }],
      unreadCount: 1,
    })

    render(<NotificationCenter initialUnreadCount={1} />)
    fireEvent.click(notificationBell())
    await screen.findByText('New booking')

    const link = document.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/')
  })

  it('refetches the panel when the window regains focus', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 2 })

    render(<NotificationCenter initialUnreadCount={0} />)
    expect(getNotificationPanel).not.toHaveBeenCalled()

    fireEvent.focus(window)

    await waitFor(() => expect(screen.getByText('2 unread')).toBeTruthy())
  })
})
