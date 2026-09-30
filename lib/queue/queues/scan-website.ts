import { lazyQueue } from '@/lib/queue/lazy-queue'

export type ScanDepth = 'single' | 'quick' | 'deep'

export type ScanWebsiteJobData = {
  scanJobId: string
  url: string
  scanDepth: ScanDepth
}

export const scanWebsiteQueue = lazyQueue<ScanWebsiteJobData>('scan-website')
