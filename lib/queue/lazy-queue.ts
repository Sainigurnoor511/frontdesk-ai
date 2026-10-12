import { Queue, type QueueOptions } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export type LazyQueue<T> = Pick<
  Queue<T>,
  'add' | 'remove' | 'getJob' | 'getJobState' | 'upsertJobScheduler'
>

export function lazyQueue<T>(
  name: string,
  opts?: Omit<QueueOptions, 'connection'>
): LazyQueue<T> {
  let queue: Queue<T> | undefined
  const ensure = () => (queue ??= new Queue<T>(name, { ...opts, connection: redisConnection }))
  return {
    add: (...args) => ensure().add(...args),
    // `remove` exists for queues that use a fixed job id: `add()` is a no-op
    // while a job with that id still sits in any set, so re-installing the
    // current truth means clearing the stale job first.
    remove: (...args) => ensure().remove(...args),
    // Lookups for add-if-absent callers that must not reset an existing job.
    getJob: (...args) => ensure().getJob(...args),
    getJobState: (...args) => ensure().getJobState(...args),
    upsertJobScheduler: (...args) => ensure().upsertJobScheduler(...args),
  }
}
