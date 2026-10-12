import { describe, it, expect } from 'vitest'
import { safeNotificationLinkPath } from './link-path'

describe('safeNotificationLinkPath', () => {
  it('passes the routes the content builder produces through unchanged', () => {
    expect(safeNotificationLinkPath('/calendar')).toBe('/calendar')
    expect(safeNotificationLinkPath('/conversations')).toBe('/conversations')
  })

  it.each([
    'https://evil.example/phish',
    'http://evil.example',
    // Protocol-relative: a `<Link href>` treats this as off-origin too.
    '//evil.example',
    'javascript:alert(1)',
    '/calendar?next=https://evil.example',
    '/calendar#x',
    '/settings',
    '',
  ])('sends %s to the fallback route', (linkPath) => {
    expect(safeNotificationLinkPath(linkPath)).toBe('/')
  })
})
