import { describe, it, expect } from 'vitest'
import { guides, getGuideBySlug } from './guides'

describe('guides data', () => {
  it('has 7 guides', () => {
    expect(guides).toHaveLength(7)
  })

  it('every guide has a non-empty title, description, and at least one step', () => {
    for (const guide of guides) {
      expect(guide.title.length).toBeGreaterThan(0)
      expect(guide.description.length).toBeGreaterThan(0)
      expect(guide.steps.length).toBeGreaterThan(0)
    }
  })

  it('every step has non-empty title and description', () => {
    for (const guide of guides) {
      for (const step of guide.steps) {
        expect(step.title.length).toBeGreaterThan(0)
        expect(step.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('every guide has a unique slug', () => {
    const slugs = guides.map((g) => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('getGuideBySlug finds an existing guide', () => {
    expect(getGuideBySlug('first-booking')?.title).toBe('How to create your first booking')
  })

  it('getGuideBySlug returns undefined for an unknown slug', () => {
    expect(getGuideBySlug('does-not-exist')).toBeUndefined()
  })
})
