import { describe, it, expect } from 'vitest'
import { isAllowedByRobots } from './robots'

describe('isAllowedByRobots', () => {
  it('allows a path when robots.txt has no matching disallow', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /admin'
    expect(isAllowedByRobots('https://example.com/about', robotsTxt)).toBe(true)
  })

  it('disallows a path matching a Disallow rule', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /admin'
    expect(isAllowedByRobots('https://example.com/admin/settings', robotsTxt)).toBe(false)
  })

  it('allows everything when robots.txt is empty', () => {
    expect(isAllowedByRobots('https://example.com/anything', '')).toBe(true)
  })

  it('disallows everything when robots.txt has a blanket disallow', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /'
    expect(isAllowedByRobots('https://example.com/anything', robotsTxt)).toBe(false)
  })
})
