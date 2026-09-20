import type { MetadataRoute } from 'next'
import { PRIVATE_PATH_PREFIXES, absoluteUrl } from '@/lib/seo/site'

/**
 * Served at /robots.txt. There was no robots.txt at all before this, which meant
 * crawlers were free to walk the authenticated dashboard routes and had no
 * pointer to a sitemap.
 *
 * AI crawlers are explicitly allowed rather than blocked. Their default-deny
 * reputation comes from sites protecting original content; here the public
 * surface is local-business booking pages, and being answerable by an assistant
 * ("book me a dentist appointment") is distribution, not leakage. Named
 * explicitly so the intent is documented rather than implied by the absence of a
 * rule — and so revoking it later is a one-line change.
 *
 * Every agent, including the AI ones, still gets the same private-path denies:
 * allowing a crawler is not the same as exposing the dashboard.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  const disallow = [...PRIVATE_PATH_PREFIXES]

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: AI_CRAWLERS, allow: '/', disallow },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
