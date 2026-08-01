import { Queue } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export type ScanDepth = 'single' | 'quick' | 'deep'

export type ScanWebsiteJobData = {
  scanJobId: string
  url: string
  scanDepth: ScanDepth
}

export const scanWebsiteQueue = new Queue<ScanWebsiteJobData>('scan-website', {
  connection: redisConnection,
})
