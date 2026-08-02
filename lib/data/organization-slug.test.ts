import { describe, it, expect, vi } from 'vitest'
import { slugify } from './organization-slug'

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Acme Dental Care')).toBe('acme-dental-care')
  })

  it('strips non-alphanumeric characters', () => {
    expect(slugify("Joe's Pizza & Subs!")).toBe('joes-pizza-subs')
  })

  it('trims leading/trailing dashes', () => {
    expect(slugify('  --Weird Name--  ')).toBe('weird-name')
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })
})
