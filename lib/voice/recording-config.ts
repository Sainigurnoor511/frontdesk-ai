export type RecordingS3Config = {
  accessKey: string
  secret: string
  bucket: string
  region: string
  endpoint: string
}

const BUCKET = 'call-recordings'

/**
 * Returns null (rather than throwing) when the Supabase Storage S3 connection
 * isn't configured — recording is optional infrastructure, and callers must
 * be able to skip starting egress in local/dev environments without it.
 */
export function getRecordingS3Config(): RecordingS3Config | null {
  const endpoint = process.env.SUPABASE_STORAGE_S3_ENDPOINT
  const region = process.env.SUPABASE_STORAGE_S3_REGION
  const accessKey = process.env.SUPABASE_STORAGE_S3_ACCESS_KEY
  const secret = process.env.SUPABASE_STORAGE_S3_SECRET_KEY

  if (!endpoint || !region || !accessKey || !secret) return null

  return { accessKey, secret, region, endpoint, bucket: BUCKET }
}
