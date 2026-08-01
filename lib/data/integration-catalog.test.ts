import { describe, it, expect } from 'vitest'
import { integrationCatalog, getIntegrationBySlug } from './integration-catalog'

describe('integration catalog data', () => {
  it('has at least 15 integrations', () => {
    expect(integrationCatalog.length).toBeGreaterThanOrEqual(15)
  })

  it('every integration has a non-empty name, description, and settingsDescription', () => {
    for (const integration of integrationCatalog) {
      expect(integration.name.length).toBeGreaterThan(0)
      expect(integration.description.length).toBeGreaterThan(0)
      expect(integration.settingsDescription.length).toBeGreaterThan(0)
    }
  })

  it('every integration has a non-empty category', () => {
    for (const integration of integrationCatalog) {
      expect(integration.category.length).toBeGreaterThan(0)
    }
  })

  it('every integration has a unique slug', () => {
    const slugs = integrationCatalog.map((i) => i.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('getIntegrationBySlug finds an existing integration', () => {
    expect(getIntegrationBySlug('google-calendar')?.name).toBe('Google Calendar')
  })

  it('getIntegrationBySlug returns undefined for an unknown slug', () => {
    expect(getIntegrationBySlug('does-not-exist')).toBeUndefined()
  })
})
