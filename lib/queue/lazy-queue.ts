import { Queue, type QueueOptions } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export function lazyQueue<T>(
  name: string,
  opts?: Omit<QueueOptions, 'connection'>
): Pick<Queue<T>, 'add'> {
  let queue: Queue<T> | undefined
  return {
    add: (...args) => {
      queue ??= new Queue<T>(name, { ...opts, connection: redisConnection })
      return queue.add(...args)
    },
  }
}
