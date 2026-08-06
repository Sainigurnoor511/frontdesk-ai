import { describe, it, expect } from 'vitest'
import { normalizeRecordingPath } from './recording-path'

describe('normalizeRecordingPath', () => {
  it('returns plain object keys unchanged', () => {
    expect(normalizeRecordingPath('conv-1.ogg')).toBe('conv-1.ogg')
  })

  it('strips bucket prefix from s3 paths', () => {
    expect(normalizeRecordingPath('s3://call-recordings/conv-1.ogg')).toBe('conv-1.ogg')
    expect(normalizeRecordingPath('call-recordings/conv-1.ogg')).toBe('conv-1.ogg')
  })
})
