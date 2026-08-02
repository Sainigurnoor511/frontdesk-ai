import { describe, it, expect } from 'vitest'
import { slugify } from './organization-slug'

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Acme Dental Care')).toBe('acme-dental-care')
  })

  it('dashes runs of non-alphanumeric characters', () => {
    expect(slugify("Joe's Pizza & Subs!")).toBe('joe-s-pizza-subs')
  })

  it('collapses adjacent separators into a single dash', () => {
    expect(slugify('Smith-Jones LLC')).toBe('smith-jones-llc')
  })

  it('trims leading/trailing dashes', () => {
    expect(slugify('  --Weird Name--  ')).toBe('weird-name')
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })
})
