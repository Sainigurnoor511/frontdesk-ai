import { Queue, type QueueOptions } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export function lazyQueue<T>(
  name: string,
  opts?: Omit<QueueOptions, 'connection'>
): Pick<Queue<T>, 'add' | 'remove' | 'getJob'> {
  let queue: Queue<T> | undefined
  const ensure = () => (queue ??= new Queue<T>(name, { ...opts, connection: redisConnection }))
  return {
    add: (...args) => ensure().add(...args),
    // `remove` and `getJob` exist for queues that use a fixed job id: `add()` is
    // a no-op while a job with that id still sits in any set, so re-installing
    // the current truth means clearing the stale job first.
    remove: (...args) => ensure().remove(...args),
    getJob: (...args) => ensure().getJob(...args),
  }
}
