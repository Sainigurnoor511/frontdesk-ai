import * as cheerio from 'cheerio'

const USER_AGENT = 'FrontDeskAI-Bot/1.0'
const FETCH_TIMEOUT_MS = 10_000

export async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    $('script, style, nav, footer, noscript').remove()
    return $('body').text().replace(/\s+/g, ' ').trim()
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return ''
    return await response.text()
  } catch {
    return ''
  }
}

export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

export function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const origin = new URL(baseUrl).origin
  const links = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const resolved = new URL(href, baseUrl)
      if (resolved.origin === origin) {
        links.add(resolved.origin + resolved.pathname)
      }
    } catch {
      // ignore malformed hrefs
    }
  })

  return Array.from(links)
}
