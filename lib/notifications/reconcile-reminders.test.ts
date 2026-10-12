import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BACKFILL_LOCK_TTL_SECONDS, reconcileAppointmentReminders } from './reconcile-reminders'

/**
 * Just enough Redis for the guard: `SET` with `NX` / `EX`, `GET`, `DEL`,
 * `EXPIRE`, with expiry against a clock the test moves. A crashed worker is a
 * process that stopped running, so "killed mid-scan" is modelled as a scan that
 * never returns while time passes and a second worker boots.
 */
const { redis } = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number | null }>()
  let now = 0
  const live = (key: string) => {
    const entry = store.get(key)
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now) {
      store.delete(key)
      return undefined
    }
    return entry
  }
  const redis = {
    store,
    advance(ms: number) {
      now += ms
    },
    reset() {
      store.clear()
      now = 0
    },
    get: async (key: string) => live(key)?.value ?? null,
    set: async (key: string, value: string, ...args: (string | number)[]) => {
      const nx = args.includes('NX')
      const exIndex = args.indexOf('EX')
      if (nx && live(key)) return null
      const ttl = exIndex >= 0 ? Number(args[exIndex + 1]) : null
      store.set(key, { value, expiresAt: ttl === null ? null : now + ttl * 1_000 })
      return 'OK'
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    expire: async (key: string, seconds: number) => {
      const entry = live(key)
      if (!entry) return 0
      entry.expiresAt = now + seconds * 1_000
      return 1
    },
  }
  return { redis }
})

vi.mock('@/lib/queue/connection', () => ({ redisConnection: redis }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/notifications/dispatch', () => ({
  scheduleAppointmentReminder: vi.fn(),
}))

const FAR_FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString()

/** Minimal PostgREST chain: thenable, terminal on await. */
function appointmentsChain(result: unknown) {
  const node: Record<string, unknown> = {}
  for (const key of ['select', 'gt', 'neq', 'order', 'limit']) {
    node[key] = vi.fn(() => node)
  }
  node.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return node
}

/**
 * Returns the chain wrapped, because the chain itself is thenable: awaiting it
 * directly would resolve to the query result instead of the spy object.
 */
async function mockRows(result: unknown) {
  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  const chain = appointmentsChain(result)
  vi.mocked(createServiceRoleClient).mockReturnValue({ from: vi.fn(() => chain) } as never)
  return { chain }
}

const TWO_ROWS = {
  data: [
    { id: 'appt-1', organization_id: 'org-1', starts_at: FAR_FUTURE },
    { id: 'appt-2', organization_id: 'org-2', starts_at: FAR_FUTURE },
  ],
  error: null,
}

/** A sleep that moves the fake Redis clock instead of waiting. */
const fastSleep = async (ms: number) => {
  redis.advance(ms)
}

beforeEach(async () => {
  vi.clearAllMocks()
  redis.reset()
  const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')
  vi.mocked(scheduleAppointmentReminder).mockResolvedValue(undefined)
})

describe('reconcileAppointmentReminders', () => {
  /**
   * Reminders are only ever enqueued by a write, so without this every
   * appointment booked before the feature shipped goes unreminded forever.
   */
  it('schedules a reminder for each future appointment', async () => {
    await mockRows(TWO_ROWS)
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await expect(reconcileAppointmentReminders(fastSleep)).resolves.toEqual({
      scheduled: 2,
      scanned: 2,
    })
    expect(scheduleAppointmentReminder).toHaveBeenCalledWith('org-1', 'appt-1', FAR_FUTURE)
  })

  // Round-2 issue 2: the reminder toggle controls the email; the in-app
  // reminder is written whatever it says, so no org is skipped here.
  it('schedules every organization without reading preferences', async () => {
    await mockRows(TWO_ROWS)
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await reconcileAppointmentReminders(fastSleep)

    expect(scheduleAppointmentReminder).toHaveBeenCalledTimes(2)
  })

  it('runs once: a later boot finds the completion marker and reads nothing', async () => {
    await mockRows(TWO_ROWS)
    await reconcileAppointmentReminders(fastSleep)

    const { chain } = await mockRows(TWO_ROWS)
    await expect(reconcileAppointmentReminders(fastSleep)).resolves.toEqual({ skipped: true })
    expect(chain.select).not.toHaveBeenCalled()
  })

  it('releases its lock and leaves no marker when the read fails, so the next boot retries', async () => {
    await mockRows({ data: null, error: { message: 'boom' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(reconcileAppointmentReminders(fastSleep)).resolves.toEqual({ skipped: true })
    expect(redis.store.size).toBe(0)
    error.mockRestore()

    await mockRows(TWO_ROWS)
    await expect(reconcileAppointmentReminders(fastSleep)).resolves.toEqual({
      scheduled: 2,
      scanned: 2,
    })
  })

  /**
   * Round-2 issue 5. The old guard was one key set with `NX` and no TTL *before*
   * the scan, released only in `catch`. SIGKILL runs no `catch`, so the key
   * stayed set and every later boot skipped the scan: the appointments the dead
   * worker had not reached were never reminded.
   */
  it('re-runs the scan when a worker is killed mid-scan and the worker restarts', async () => {
    await mockRows(TWO_ROWS)
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')
    // Worker 1 schedules the first appointment, then dies inside the second.
    vi.mocked(scheduleAppointmentReminder)
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise(() => {}))
    void reconcileAppointmentReminders(fastSleep)
    await vi.waitFor(() => expect(scheduleAppointmentReminder).toHaveBeenCalledTimes(2))

    // The restarted container boots seconds later, while the dead worker's lock
    // still has most of its TTL: it waits the lock out rather than giving up.
    vi.mocked(scheduleAppointmentReminder).mockClear()
    vi.mocked(scheduleAppointmentReminder).mockResolvedValue(undefined)
    redis.advance(5_000)

    await expect(reconcileAppointmentReminders(fastSleep)).resolves.toEqual({
      scheduled: 2,
      scanned: 2,
    })
    expect(scheduleAppointmentReminder).toHaveBeenCalledWith('org-2', 'appt-2', FAR_FUTURE)
  })

  it('does not scan while another live worker holds the lock', async () => {
    const { chain } = await mockRows(TWO_ROWS)
    await redis.set('notify:reminder-backfill:v1:lock', 'someone-else', 'EX', 3_600, 'NX')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(reconcileAppointmentReminders(fastSleep)).resolves.toEqual({ skipped: true })
    expect(chain.select).not.toHaveBeenCalled()
    // And it does not release a lock it does not hold.
    expect(await redis.get('notify:reminder-backfill:v1:lock')).toBe('someone-else')
    warn.mockRestore()
  })

  it('holds the lock for a short TTL, not forever', async () => {
    await mockRows(TWO_ROWS)
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')
    vi.mocked(scheduleAppointmentReminder).mockImplementationOnce(() => new Promise(() => {}))
    void reconcileAppointmentReminders(fastSleep)
    await vi.waitFor(() => expect(scheduleAppointmentReminder).toHaveBeenCalledTimes(1))

    expect(await redis.get('notify:reminder-backfill:v1:lock')).not.toBeNull()
    redis.advance(BACKFILL_LOCK_TTL_SECONDS * 1_000)
    expect(await redis.get('notify:reminder-backfill:v1:lock')).toBeNull()
  })
})
