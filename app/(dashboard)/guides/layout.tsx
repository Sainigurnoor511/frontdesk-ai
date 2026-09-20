/**
 * Exists only to carry the route's title. `guides/page.tsx` is a client component
 * and client components can't export `metadata`, so the title has to come from a
 * server layout wrapping it.
 */
export const metadata = { title: 'Guides' }

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return children
}
