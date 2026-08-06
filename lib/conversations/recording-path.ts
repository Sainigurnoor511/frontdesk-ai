const RECORDING_BUCKET = 'call-recordings'

/**
 * Normalizes egress / storage paths to the object key inside `call-recordings`.
 */
export function normalizeRecordingPath(filename: string): string {
  const trimmed = filename.trim()
  if (!trimmed) return trimmed

  const withoutProtocol = trimmed.replace(/^s3:\/\//, '')
  const bucketPrefix = `${RECORDING_BUCKET}/`
  if (withoutProtocol.startsWith(bucketPrefix)) {
    return withoutProtocol.slice(bucketPrefix.length)
  }
  if (withoutProtocol.startsWith(RECORDING_BUCKET) && withoutProtocol.includes('/')) {
    const parts = withoutProtocol.split('/')
    if (parts[0] === RECORDING_BUCKET && parts.length > 1) {
      return parts.slice(1).join('/')
    }
  }

  return trimmed
}
