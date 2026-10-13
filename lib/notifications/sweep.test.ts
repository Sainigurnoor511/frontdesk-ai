// Real sweep, dispatch and queue modules over a BullMQ-semantics queue fake and a filtering DB fake.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  EMAIL_SWEEP_MAX_RETRIES,
  registerNotificationSweep,
  runNotificationSweep,
  sweepAppointmentReminders,
  sweepOwedEmails,
  SWEEP_PAGE_SIZE,
} from './sweep'
import { scheduleAppointmentReminder } from './dispatch'
import { REMINDER_LEAD_MS } from './types'

type FakeJob = {
  id: string
  name: string
  data: Record<string, unknown>
  delay: number
  state: string
  /** Increments on every install, so a reset job is distinguishable from a kept one. */
  installSeq: number
}

const { queue } = vi.hoisted(() => {
  const jobs = new Map<string, FakeJob>()
  let seq = 0
  const queue = {
    jobs,
    add: vi.fn(async (name: string, data: Record<string, unknown>, opts: { jobId: string; delay?: number }) => {
      if (jobs.has(opts.jobId)) return
      const delay = opts.delay ?? 0
      jobs.set(opts.jobId, {
        id: opts.jobId,
        name,
        data,
        delay,
        state: delay > 0 ? 'delayed' : 'waiting',
        installSeq: (seq += 1),
      })
    }),
    remove: vi.fn(async (jobId: string) => {
      const job = jobs.get(jobId)
      if (job?.state === 'active') throw new Error(`Job ${jobId} is locked`)
      jobs.delete(jobId)
      return job ? 1 : 0
    }),
    getJob: vi.fn(async (jobId: string) => {
      const job = jobs.get(jobId)
      return job ? { id: job.id, data: job.data, getState: async () => job.state } : undefined
    }),
    getJobState: vi.fn(async (jobId: string) => jobs.get(jobId)?.state ?? 'unknown'),
    upsertJobScheduler: vi.fn(async () => ({})),
  }
  return { queue }
})

vi.mock('@/lib/queue/lazy-queue', () => ({ lazyQueue: () => queue }))

type Row = Record<string, unknown>

const { db } = vi.hoisted(() => {
  const tables: Record<string, Row[]> = { appointments: [], notifications: [] }
  const reads: { table: string; limit: number; returned: number }[] = []

  const KEYSET = /^(\w+)\.gt\."([^"]+)",and\(\1\.eq\."\2",id\.gt\."([^"]+)"\)$/

  function builder(table: string, patch?: Row) {
    const filters: ((row: Row) => boolean)[] = []
    const orders: string[] = []
    let limit = Number.POSITIVE_INFINITY
    let head = false
    const value = (row: Row, column: string) => (row[column] ?? null) as string | number | null

    const node: Record<string, unknown> = {
      select: (_columns?: string, options?: { head?: boolean }) => {
        if (options?.head) head = true
        return node
      },
      eq: (c: string, v: unknown) => (filters.push((r) => value(r, c) === v), node),
      neq: (c: string, v: unknown) => (filters.push((r) => value(r, c) !== v), node),
      gt: (c: string, v: string) => (filters.push((r) => String(value(r, c)) > v), node),
      lt: (c: string, v: string) => (filters.push((r) => String(value(r, c)) < v), node),
      lte: (c: string, v: string) => (filters.push((r) => String(value(r, c)) <= v), node),
      is: (c: string, v: unknown) => (filters.push((r) => value(r, c) === v), node),
      like: (c: string, pattern: string) => {
        const prefix = pattern.replace(/%$/, '')
        filters.push((r) => String(value(r, c)).startsWith(prefix))
        return node
      },
      or: (expression: string) => {
        const match = KEYSET.exec(expression)
        if (!match) throw new Error(`fake db: unsupported or=${expression}`)
        const [, column, after, afterId] = match
        filters.push((r) => {
          const v = String(value(r, column))
          return v > after || (v === after && String(r.id) > afterId)
        })
        return node
      },
      order: (c: string) => (orders.push(c), node),
      limit: (n: number) => ((limit = n), node),
      maybeSingle: () => Promise.resolve(run()).then((res) => ({ ...res, data: res.data?.[0] ?? null })),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }

    function run(): { data: Row[] | null; count?: number; error: null } {
      const matched = tables[table].filter((row) => filters.every((filter) => filter(row)))
      if (patch) {
        for (const row of matched) Object.assign(row, patch)
        return { data: matched.map((row) => ({ ...row })), error: null }
      }
      if (head) return { data: null, count: matched.length, error: null }
      const sorted = [...matched].sort((a, b) => {
        for (const column of orders) {
          const x = String(value(a, column))
          const y = String(value(b, column))
          if (x !== y) return x < y ? -1 : 1
        }
        return 0
      })
      const page = sorted.slice(0, limit)
      reads.push({ table, limit, returned: page.length })
      return { data: page.map((row) => ({ ...row })), error: null }
    }

    return node
  }

  const db = {
    tables,
    reads,
    reset() {
      tables.appointments = []
      tables.notifications = []
      reads.length = 0
    },
    client: {
      from: (table: string) => ({
        select: (columns?: string, options?: { head?: boolean }) =>
          (builder(table).select as (c?: string, o?: { head?: boolean }) => unknown)(columns, options),
        update: (patch: Row) => builder(table, patch),
      }),
    },
  }
  return { db }
})

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => db.client }))

const HOUR = 3_600_000
const MINUTE = 60_000
const ORG = '11111111-1111-1111-1111-111111111111'

/** Uuid-shaped, and ordered by `n`, so keyset tie-breaks on `id` are exercised. */
function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
}

function appointment(n: number, startsAtMs: number, overrides: Row = {}): Row {
  return {
    id: uuid('aaaaaaaa', n),
    organization_id: ORG,
    starts_at: new Date(startsAtMs).toISOString(),
    created_at: new Date(startsAtMs - 10 * 86_400_000).toISOString(),
    status: 'confirmed',
    ...overrides,
  }
}

const reminderJobs = () => [...queue.jobs.values()].filter((job) => job.name === 'appointment_reminder')
const reminderJobId = (appointmentId: string) => `notify:appointment_reminder:${appointmentId}`

let log: ReturnType<typeof vi.spyOn>
let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  queue.jobs.clear()
  db.reset()
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  log.mockRestore()
  errorLog.mockRestore()
})

describe('sweepAppointmentReminders', () => {
  // Round-3 issue 2: the old backfill read `.limit(2000)` once and silently dropped the rest.
  it('schedules every appointment in the window when there are more than one page of them', async () => {
    const now = Date.now()
    const total = SWEEP_PAGE_SIZE * 2 + 203
    // Seven appointments share each start, so page boundaries fall inside ties.
    db.tables.appointments = Array.from({ length: total }, (_, n) =>
      appointment(n, now + REMINDER_LEAD_MS + HOUR + Math.floor(n / 7) * MINUTE)
    )

    const counts = await sweepAppointmentReminders(now)

    expect(counts.scanned).toBe(total)
    expect(counts.added).toBe(total)
    expect(reminderJobs()).toHaveLength(total)
    for (const row of db.tables.appointments) {
      expect(queue.jobs.has(reminderJobId(String(row.id)))).toBe(true)
    }
    // Three pages, the last one short: no cap anywhere.
    const pages = db.reads.filter((read) => read.table === 'appointments')
    expect(pages.map((page) => page.returned)).toEqual([SWEEP_PAGE_SIZE, SWEEP_PAGE_SIZE, 203])
  })

  it('reads only the near window and skips cancelled appointments', async () => {
    const now = Date.now()
    db.tables.appointments = [
      appointment(1, now + REMINDER_LEAD_MS + 6 * HOUR),
      appointment(2, now + REMINDER_LEAD_MS + 6 * HOUR, { status: 'cancelled' }),
      // Weeks out: Postgres is its only record until the fire time is near.
      appointment(3, now + 21 * 86_400_000),
      // Already started.
      appointment(4, now - HOUR),
    ]

    await sweepAppointmentReminders(now)

    expect(reminderJobs().map((job) => job.data.subjectId)).toEqual([uuid('aaaaaaaa', 1)])
  })

  // Same rule as scheduleAppointmentReminder(), even though the grace window can see it.
  it('does not remind an appointment that was booked inside the 24h lead', async () => {
    const now = Date.now()
    const startsAtMs = now + REMINDER_LEAD_MS - 10 * MINUTE
    db.tables.appointments = [
      appointment(1, startsAtMs, { created_at: new Date(now - 5 * MINUTE).toISOString() }),
    ]

    const counts = await sweepAppointmentReminders(now)

    expect(counts.notOwed).toBe(1)
    expect(reminderJobs()).toHaveLength(0)
  })

  // Round-3 issue 3: a Redis loss behind a surviving one-time marker left reminders unscheduled.
  it('rebuilds the near-window reminders on the next sweep after the delayed set is wiped', async () => {
    const t0 = Date.now()
    db.tables.appointments = [
      appointment(1, t0 + REMINDER_LEAD_MS + 2 * MINUTE),
      appointment(2, t0 + REMINDER_LEAD_MS + 12 * HOUR),
      appointment(3, t0 + REMINDER_LEAD_MS + 40 * HOUR),
      // Outside the look-ahead: never in Redis, so nothing to lose.
      appointment(4, t0 + 10 * 86_400_000),
    ]
    await sweepAppointmentReminders(t0)
    expect(reminderJobs()).toHaveLength(3)

    // Only the delayed set goes; anything else Redis held (an old-style marker) survives.
    for (const [id, job] of queue.jobs) if (job.state === 'delayed') queue.jobs.delete(id)
    expect(reminderJobs()).toHaveLength(0)

    // One interval later. Appointment 1's fire time passed in between.
    const t1 = t0 + 5 * MINUTE
    const counts = await sweepAppointmentReminders(t1)

    expect(counts.added).toBe(3)
    expect(reminderJobs().map((job) => job.data.subjectId).sort()).toEqual(
      [uuid('aaaaaaaa', 1), uuid('aaaaaaaa', 2), uuid('aaaaaaaa', 3)].sort()
    )
    // Due now, not skipped: at most one interval late.
    expect(queue.jobs.get(reminderJobId(uuid('aaaaaaaa', 1)))?.delay).toBe(0)
  })

  // A five-minute sweep must never reset or stack a job; a reschedule leaves exactly one.
  describe('add-if-absent', () => {
    it('does not reset or duplicate a reminder job that already exists', async () => {
      const now = Date.now()
      db.tables.appointments = [
        appointment(1, now + REMINDER_LEAD_MS + 3 * HOUR),
        appointment(2, now + REMINDER_LEAD_MS + 9 * HOUR),
      ]
      await sweepAppointmentReminders(now)
      const installed = new Map(reminderJobs().map((job) => [job.id, job.installSeq]))
      queue.add.mockClear()
      queue.remove.mockClear()

      const counts = await sweepAppointmentReminders(now + 5 * MINUTE)

      expect(counts).toMatchObject({ kept: 2, added: 0, replaced: 0 })
      expect(queue.remove).not.toHaveBeenCalled()
      expect(queue.add).not.toHaveBeenCalled()
      expect(reminderJobs()).toHaveLength(2)
      for (const job of reminderJobs()) expect(job.installSeq).toBe(installed.get(job.id))
    })

    it('leaves a rescheduled appointment with exactly one job, for the new time', async () => {
      const now = Date.now()
      const row = appointment(1, now + REMINDER_LEAD_MS + 3 * HOUR)
      db.tables.appointments = [row]
      await sweepAppointmentReminders(now)

      // Moved later, still inside the window: the write path re-installs.
      const moved = new Date(now + REMINDER_LEAD_MS + 20 * HOUR).toISOString()
      row.starts_at = moved
      await scheduleAppointmentReminder(ORG, String(row.id), moved)

      expect(reminderJobs()).toHaveLength(1)
      expect(reminderJobs()[0].data.startsAt).toBe(moved)

      // The next sweep agrees with it and leaves it alone.
      const counts = await sweepAppointmentReminders(now + 5 * MINUTE)
      expect(counts).toMatchObject({ kept: 1, added: 0, replaced: 0 })
      expect(reminderJobs()).toHaveLength(1)
      expect(reminderJobs()[0].data.startsAt).toBe(moved)
    })

    it('replaces a stale job left by a reschedule whose removal never reached Redis', async () => {
      const now = Date.now()
      const row = appointment(1, now + REMINDER_LEAD_MS + 3 * HOUR)
      db.tables.appointments = [row]
      await sweepAppointmentReminders(now)

      // The appointment moved, but the write path's Redis call was lost.
      row.starts_at = new Date(now + REMINDER_LEAD_MS + 30 * HOUR).toISOString()

      const counts = await sweepAppointmentReminders(now + 5 * MINUTE)

      expect(counts.replaced).toBe(1)
      expect(reminderJobs()).toHaveLength(1)
      expect(reminderJobs()[0].data.startsAt).toBe(row.starts_at)
    })

    it('hands an appointment moved beyond the window back to the sweep, then installs it once', async () => {
      const now = Date.now()
      const row = appointment(1, now + REMINDER_LEAD_MS + 3 * HOUR)
      db.tables.appointments = [row]
      await sweepAppointmentReminders(now)

      const movedFar = now + 10 * 86_400_000
      row.starts_at = new Date(movedFar).toISOString()
      await scheduleAppointmentReminder(ORG, String(row.id), String(row.starts_at))
      expect(reminderJobs()).toHaveLength(0)

      // Days later, the fire time enters the look-ahead.
      await sweepAppointmentReminders(movedFar - REMINDER_LEAD_MS - 47 * HOUR)
      expect(reminderJobs()).toHaveLength(1)
      expect(reminderJobs()[0].data.startsAt).toBe(row.starts_at)
    })
  })
})

describe('sweepOwedEmails', () => {
  const APPOINTMENT = uuid('bbbbbbbb', 1)

  function notification(n: number, overrides: Row): Row {
    return {
      id: uuid('cccccccc', n),
      organization_id: ORG,
      type: 'client_booking',
      dedupe_key: uuid('bbbbbbbb', n),
      email_status: 'pending',
      email_sent_at: null,
      email_claimed_at: null,
      email_claim_token: null,
      email_sweep_count: 0,
      email_last_swept_at: null,
      ...overrides,
    }
  }

  const sweepJobs = () => [...queue.jobs.values()].filter((job) => job.id.includes(':sweep'))

  // Round-3 issue 1: an unsent email could sit with no live job and nothing scanning for it.
  it('re-queues an owed email with no live job, leaves skipped ones, and abandons past the bound', async () => {
    const now = Date.now()
    const old = new Date(now - 20 * MINUTE).toISOString()
    db.tables.notifications = [
      // Owed, nothing working on it.
      notification(1, { created_at: old }),
      // Preference off at delivery: no email owed, ever.
      notification(2, { created_at: old, email_status: 'skipped' }),
      // Every retry spent, and the last one had its wait.
      notification(3, {
        created_at: new Date(now - 20 * HOUR).toISOString(),
        email_sweep_count: EMAIL_SWEEP_MAX_RETRIES,
        email_last_swept_at: new Date(now - 5 * HOUR).toISOString(),
      }),
    ]

    const first = await sweepOwedEmails(now)

    expect(first).toMatchObject({ requeued: 1, abandoned: 1 })
    expect(sweepJobs().map((job) => job.id)).toEqual([
      `notify:client_booking:${uuid('bbbbbbbb', 1)}:sweep1`,
    ])
    expect(sweepJobs()[0].data).toEqual({
      organizationId: ORG,
      type: 'client_booking',
      subjectId: uuid('bbbbbbbb', 1),
      sweepAttempt: 1,
    })
    const [owed, skipped, spent] = db.tables.notifications
    expect(owed.email_sweep_count).toBe(1)
    expect(skipped.email_sweep_count).toBe(0)
    expect(spent.email_status).toBe('abandoned')
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('ABANDONED'))

    // Abandoned is out for good, and skipped is still never queued.
    queue.jobs.clear()
    errorLog.mockClear()
    const later = await sweepOwedEmails(now + 2 * HOUR)

    expect(later.abandoned).toBe(0)
    expect(later.owed).toBe(1)
    expect(sweepJobs().map((job) => job.data.subjectId)).toEqual([uuid('bbbbbbbb', 1)])
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('leaves a row alone while it is leased, backing off, or has a live job', async () => {
    const now = Date.now()
    const old = new Date(now - 20 * MINUTE).toISOString()
    db.tables.notifications = [
      notification(1, { created_at: old, email_claimed_at: new Date(now - 30_000).toISOString() }),
      notification(2, {
        created_at: new Date(now - 3 * HOUR).toISOString(),
        email_sweep_count: 2,
        email_last_swept_at: new Date(now - 10 * MINUTE).toISOString(),
      }),
      notification(3, { created_at: old }),
      // Too young: its own first delivery is still within reach.
      notification(4, { created_at: new Date(now - 2 * MINUTE).toISOString() }),
    ]
    // Row 3 is in a cap-deferral chain: its next window's job is waiting.
    await queue.add('client_booking', {}, {
      jobId: `notify:client_booking:${uuid('bbbbbbbb', 3)}:defer2`,
      delay: 30 * MINUTE,
    })

    const counts = await sweepOwedEmails(now)

    expect(counts).toMatchObject({ owed: 3, requeued: 0, inFlight: 2, backingOff: 1 })
    expect(sweepJobs()).toHaveLength(0)
  })

  it('re-queues a reminder row under its appointment, not its dedupe key', async () => {
    const now = Date.now()
    db.tables.notifications = [
      notification(1, {
        type: 'appointment_reminder',
        dedupe_key: `${APPOINTMENT}:2026-11-02T15:00:00.000Z`,
        created_at: new Date(now - 20 * MINUTE).toISOString(),
      }),
    ]

    await sweepOwedEmails(now)

    expect(sweepJobs()[0].id).toBe(`notify:appointment_reminder:${APPOINTMENT}:sweep1`)
    expect(sweepJobs()[0].data.subjectId).toBe(APPOINTMENT)
  })
})

describe('runNotificationSweep', () => {
  it('logs how many emails are pending and abandoned', async () => {
    const now = Date.now()
    db.tables.notifications = [
      { id: uuid('cccccccc', 1), email_status: 'pending', created_at: new Date(now).toISOString() },
      { id: uuid('cccccccc', 2), email_status: 'abandoned', created_at: new Date(now).toISOString() },
      { id: uuid('cccccccc', 3), email_status: 'abandoned', created_at: new Date(now).toISOString() },
      { id: uuid('cccccccc', 4), email_status: 'sent', created_at: new Date(now).toISOString() },
    ]

    const result = await runNotificationSweep(now)

    expect(result).toMatchObject({ pending: 1, abandoned: 2 })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/pending=1 abandoned=2$/))
  })
})

describe('registerNotificationSweep', () => {
  it('upserts one job scheduler on the delivery queue, so a re-register is a no-op', async () => {
    await registerNotificationSweep()
    await registerNotificationSweep()

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2)
    for (const call of queue.upsertJobScheduler.mock.calls as unknown[][]) {
      expect(call[0]).toBe('notification-sweep')
      expect(call[1]).toEqual({ every: 5 * MINUTE })
      expect(call[2]).toMatchObject({ name: 'notification-sweep' })
    }
    expect(log).toHaveBeenCalledWith(expect.stringContaining('sweep registered'))
  })
})
