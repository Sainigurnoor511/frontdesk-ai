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

describe('NotificationCenter', () => {
  it('lists notifications with unread state and an unread count', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: ITEMS, unreadCount: 1 })

    render(<NotificationCenter initialUnreadCount={1} />)

    expect(screen.getByText('1 unread')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('New booking')).toBeTruthy()
    expect(screen.getByText('Call summary')).toBeTruthy()
    const unreadRows = document.querySelectorAll('[data-unread="true"]')
    expect(unreadRows).toHaveLength(1)
  })

  it('renders the empty state and disables mark-all when there is nothing', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockResolvedValue({ items: [], unreadCount: 0 })

    render(<NotificationCenter initialUnreadCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    fireEvent.click(await screen.findByText('New booking'))

    expect(markNotificationAsRead).toHaveBeenCalledWith(ITEMS[0].id)
    await waitFor(() => expect(screen.getByText('0 unread')).toBeTruthy())
  })

  it('clears the loader and keeps the header usable when the panel read rejects', async () => {
    const { getNotificationPanel } = await import('./notification-actions')
    vi.mocked(getNotificationPanel).mockRejectedValue(new Error('offline'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<NotificationCenter initialUnreadCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))

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
})
