// Leaf module like `lib/notifications/types.ts`: reachable from the header
// notification center (a client component), so it imports nothing.

/**
 * The in-app routes a notification is allowed to link to. Every value
 * `buildNotificationContent()` produces is in this list; it is closed rather
 * than derived so a row that did not come from the content builder cannot widen
 * it.
 */
export const NOTIFICATION_LINK_PATHS = ['/conversations', '/calendar'] as const

/** Where a row with an unusable `link_path` sends the user instead. */
export const NOTIFICATION_FALLBACK_LINK_PATH = '/'

/**
 * Constrains `notifications.link_path` to an in-app route at render time.
 *
 * The column is written by the worker, but RLS alone is not a reason to trust it
 * at the point of rendering: a row that arrives with `https://evil.example` or
 * `//evil.example` would otherwise become an off-origin call to action inside
 * the product's own UI. Query strings and fragments are rejected too — nothing
 * generates them, so their presence means the value did not come from here.
 */
export function safeNotificationLinkPath(linkPath: string): string {
  return (NOTIFICATION_LINK_PATHS as readonly string[]).includes(linkPath)
    ? linkPath
    : NOTIFICATION_FALLBACK_LINK_PATH
}
