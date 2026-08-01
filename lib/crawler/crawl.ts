import { isAllowedByRobots } from './robots'
import { fetchPageText, fetchRobotsTxt, fetchPageHtml, extractSameDomainLinks } from './fetch-page'

const DEPTH_BUDGETS = {
  single: { maxPages: 1, maxDepth: 0 },
  quick: { maxPages: 6, maxDepth: 1 },
  deep: { maxPages: 20, maxDepth: 2 },
} as const

export async function crawlWebsite(
  startUrl: string,
  scanDepth: 'single' | 'quick' | 'deep'
): Promise<string> {
  const budget = DEPTH_BUDGETS[scanDepth]
  const origin = new URL(startUrl).origin
  const robotsTxt = await fetchRobotsTxt(origin)

  const visited = new Set<string>()
  const pageTexts: string[] = []
  let queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }]

  while (queue.length > 0 && visited.size < budget.maxPages) {
    const { url, depth } = queue.shift()!
    if (visited.has(url)) continue
    if (!isAllowedByRobots(url, robotsTxt)) continue

    visited.add(url)

    try {
      const text = await fetchPageText(url)
      pageTexts.push(text)
    } catch {
      continue
    }

    if (depth < budget.maxDepth && visited.size < budget.maxPages) {
      const html = await fetchPageHtml(url)
      if (!html) continue
      const links = extractSameDomainLinks(html, url)
      const heuristicPaths = ['about', 'services', 'contact', 'hours', 'pricing']
      const prioritized = links
        .filter((link) => !visited.has(link))
        .sort((a, b) => {
          const aMatch = heuristicPaths.some((p) => a.includes(p)) ? 0 : 1
          const bMatch = heuristicPaths.some((p) => b.includes(p)) ? 0 : 1
          return aMatch - bMatch
        })

      for (const link of prioritized) {
        if (visited.size + queue.length >= budget.maxPages) break
        queue.push({ url: link, depth: depth + 1 })
      }
    }
  }

  return pageTexts.join('\n\n')
}
