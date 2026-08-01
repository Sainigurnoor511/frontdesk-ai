import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./fetch-page', () => ({
  fetchPageText: vi.fn().mockResolvedValue('page text content'),
  fetchRobotsTxt: vi.fn().mockResolvedValue(''),
  fetchPageHtml: vi.fn().mockResolvedValue('<html></html>'),
  extractSameDomainLinks: vi.fn().mockReturnValue([
    'https://example.com/about',
    'https://example.com/services',
    'https://example.com/contact',
  ]),
}))

import { crawlWebsite } from './crawl'
import { fetchPageText } from './fetch-page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crawlWebsite', () => {
  it('single depth fetches only the start URL', async () => {
    await crawlWebsite('https://example.com', 'single')
    expect(fetchPageText).toHaveBeenCalledTimes(1)
    expect(fetchPageText).toHaveBeenCalledWith('https://example.com')
  })

  it('quick depth fetches the root plus discovered same-domain links, budget-capped', async () => {
    await crawlWebsite('https://example.com', 'quick')
    const calls = (fetchPageText as ReturnType<typeof vi.fn>).mock.calls.length
    expect(calls).toBeGreaterThan(1)
    expect(calls).toBeLessThanOrEqual(6)
  })

  it('returns concatenated text from all fetched pages', async () => {
    const result = await crawlWebsite('https://example.com', 'single')
    expect(result).toContain('page text content')
  })
})
