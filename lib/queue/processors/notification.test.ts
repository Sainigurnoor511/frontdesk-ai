// Imports the real processor, so this suite is the `server-only` canary for the
// delivery path: a `server-only` import anywhere under it fails at import time.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UnrecoverableError, type Job } from 'bullmq'
import { describeNotificationJob, processNotification } from './notification'
import type { NotificationJobData } from '@/lib/queue/queues/notification'

const { batchSendMock, MockResend } = vi.hoisted(() => {
  const batchSendMock = vi.fn()
  class MockResend {
    batch = { send: batchSendMock }
  }
  return { batchSendMock, MockResend }
})

vi.mock('resend', () => ({ Resend: MockResend }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

// Step 10 otherwise opens a socket to localhost:6379 — REDIS_URL is unset here.
vi.mock('@/lib/voice/rate-limit', () => ({
  checkAndConsumeRateLimit: vi.fn(),
  claimRateLimitCharge: vi.fn(),
  releaseRateLimitCharge: vi.fn(),
  rateLimitWindowSecondsRemaining: vi.fn(),
}))

// The cap-deferral re-enqueue (issue 6) is the only queue write the processor
// makes; mocking at `lazy-queue` keeps the real queue module in the graph.
const { queueAddMock, queueRemoveMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(),
  queueRemoveMock: vi.fn(),
}))
vi.mock('@/lib/queue/lazy-queue', () => ({
  lazyQueue: () => ({ add: queueAddMock, remove: queueRemoveMock }),
}))

// The sweep has its own suite; only the routing of the scheduler's job matters here.
const { runNotificationSweepMock } = vi.hoisted(() => ({ runNotificationSweepMock: vi.fn() }))
vi.mock('@/lib/notifications/sweep', () => ({ runNotificationSweep: runNotificationSweepMock }))

const ORG = '11111111-1111-1111-1111-111111111111'
const OTHER_ORG = '99999999-9999-9999-9999-999999999999'
const CONVERSATION = '22222222-2222-2222-2222-222222222222'
const APPOINTMENT = '33333333-3333-3333-3333-333333333333'

const ALL_ON = {
  notify_post_call_summary: true,
  notify_appointment_reminders: true,
  notify_client_bookings: true,
  notify_staff_bookings: true,
}

const CONVERSATION_ROW = {
  id: CONVERSATION,
  organization_id: ORG,
  status: 'completed',
  summary: 'Caller booked a cleaning.',
  outcome: 'successful',
  duration_seconds: 95,
  created_at: '2026-08-03T18:00:00+00:00',
}

const APPOINTMENT_ROW = {
  id: APPOINTMENT,
  organization_id: ORG,
  title: 'Teeth cleaning',
  client_name: 'Ada Lovelace',
  client_phone: '+14155551234',
  starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  ends_at: new Date(Date.now() + 5 * 86_400_000 + 3_600_000).toISOString(),
  status: 'confirmed',
}

/** An appointment whose 24h reminder is due now: it starts a little under 24h out. */
function dueReminderRow(overrides: Record<string, unknown> = {}, hoursOut = 23) {
  const startsAtMs = Date.now() + hoursOut * 3_600_000
  return {
    ...APPOINTMENT_ROW,
    starts_at: new Date(startsAtMs).toISOString(),
    ends_at: new Date(startsAtMs + 3_600_000).toISOString(),
    ...overrides,
  }
}

/** Minimal PostgREST-shaped chain: thenable, and terminal through single/maybeSingle. */
function chain(result: unknown) {
  const node: Record<string, unknown> = {}
  for (const key of ['select', 'eq', 'order', 'limit', 'is', 'in', 'or', 'gt', 'neq', 'like']) {
    node[key] = vi.fn(() => node)
  }
  node.maybeSingle = vi.fn(() => Promise.resolve(result))
  node.single = vi.fn(() => Promise.resolve(result))
  node.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return node
}

type ClientOptions = {
  settings?: unknown
  conversation?: unknown
  appointment?: unknown
  members?: unknown
  /** Result of the `notifications` insert (the row claim). */
  claimInsert?: unknown
  /** Result of the conflict follow-up read. */
  claimRead?: unknown
  /** Result of the conditional lease update (the send claim). */
  emailClaim?: unknown
  userEmails?: Record<string, string | null>
  /** Per-user Auth lookup failure, for the transient-vs-missing split. */
  userErrors?: Record<string, { status?: number; code?: string; message: string }>
  /** Thrown by `getUserById` instead of returned, i.e. a network failure. */
  userThrows?: string[]
  /** Replaces the single-row `notifications` model with a filterable table. */
  notificationsTable?: FakeNotificationsTable
}

type FakeRow = Record<string, unknown>
type FakeNotificationsTable = ReturnType<typeof fakeNotificationsTable>

/**
 * A `notifications` table that honours the filters the service module applies
 * (`eq`, `neq`, `is`, `like 'prefix%'`) and the unique index on
 * `(organization_id, type, dedupe_key)`. Needed wherever a test is about *which*
 * row a delivery lands on — the single-row model below cannot tell a reminder
 * for the old time from one for the new time.
 *
 * The lease predicate (`.or(...)`) is treated as matching: lease contention is
 * covered by the single-row tests.
 */
function fakeNotificationsTable() {
  const rows: FakeRow[] = []
  let nextId = 1

  function query(patch?: FakeRow) {
    const filters: ((row: FakeRow) => boolean)[] = []
    const node: Record<string, unknown> = {}
    node.eq = (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return node
    }
    node.neq = (column: string, value: unknown) => {
      filters.push((row) => row[column] !== value)
      return node
    }
    node.is = (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value)
      return node
    }
    node.like = (column: string, pattern: string) => {
      const prefix = pattern.replace(/%$/, '')
      filters.push((row) => String(row[column]).startsWith(prefix))
      return node
    }
    node.or = () => node
    node.select = () => node
    const run = () => {
      const matched = rows.filter((row) => filters.every((filter) => filter(row)))
      if (patch) for (const row of matched) Object.assign(row, patch)
      return matched
    }
    node.maybeSingle = () => Promise.resolve({ data: run()[0] ?? null, error: null })
    node.single = node.maybeSingle
    node.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: run(), error: null }).then(resolve, reject)
    return node
  }

  return {
    rows,
    insert: (values: FakeRow) => {
      const exec = () => {
        const duplicate = rows.some(
          (row) =>
            row.organization_id === values.organization_id &&
            row.type === values.type &&
            row.dedupe_key === values.dedupe_key
        )
        if (duplicate) return { data: null, error: { code: '23505', message: 'duplicate key' } }
        const row: FakeRow = {
          id: `notif-${nextId++}`,
          email_sent_at: null,
          email_status: 'pending',
          email_claimed_at: null,
          email_claim_token: null,
          superseded_at: null,
          is_read: false,
          ...values,
        }
        rows.push(row)
        return { data: row, error: null }
      }
      const node: Record<string, unknown> = {}
      node.select = () => node
      node.single = () => Promise.resolve(exec())
      return node
    },
    select: () => query(),
    update: (patch: FakeRow) => query(patch),
  }
}

async function mockClient(options: ClientOptions = {}) {
  const {
    settings = { data: ALL_ON, error: null },
    conversation = { data: CONVERSATION_ROW, error: null },
    appointment = { data: APPOINTMENT_ROW, error: null },
    members = { data: [{ user_id: 'user-1' }], error: null },
    claimInsert,
    claimRead,
    emailClaim = { data: { id: 'notif-1' }, error: null },
    userEmails = { 'user-1': 'owner@example.com' },
    userErrors = {},
    userThrows = [],
    notificationsTable,
  } = options

  // The claimed row is stateful across calls within one `mockClient()`, so a
  // second `processNotification()` sees what the first attempt actually wrote.
  // That is what makes the issue-2 regression reproducible: with the old
  // ordering, attempt 1 stamped `email_sent_at` and attempt 2 returned at step 9
  // without ever calling Resend.
  const row = {
    id: 'notif-1',
    email_sent_at: null as string | null,
    email_status: 'pending' as string,
  }
  const notificationsInsert = vi.fn(() =>
    chain(claimInsert ?? { data: { ...row }, error: null })
  )
  const notificationsSelect = vi.fn(() => chain(claimRead ?? { data: { ...row }, error: null }))
  // Three distinct writes share this table: taking the lease
  // (`email_claim_token`), releasing it (both lease columns null), and the
  // durable `email_sent_at` stamp. Only the lease claim is conditional.
  const notificationsUpdate = vi.fn((patch: Record<string, unknown>) => {
    // Status is untracked here (one row shared across types); see fakeNotificationsTable.
    if (typeof patch.email_sent_at === 'string') row.email_sent_at = patch.email_sent_at
    return chain(
      'email_claim_token' in patch && patch.email_claim_token
        ? emailClaim
        : { data: null, error: null }
    )
  })
  const membersChain = chain(members)

  const from = vi.fn((table: string) => {
    switch (table) {
      case 'organization_settings':
        return chain(settings)
      case 'business_profile':
        return chain({ data: { timezone: 'America/New_York' }, error: null })
      case 'organizations':
        return chain({ data: { name: 'Smile Dental' }, error: null })
      case 'conversations':
        return chain(conversation)
      case 'appointments':
        return chain(appointment)
      case 'members':
        return membersChain
      case 'notifications':
        if (notificationsTable) return notificationsTable
        return {
          insert: notificationsInsert,
          select: notificationsSelect,
          update: notificationsUpdate,
        }
      default:
        throw new Error(`Unexpected table: ${table}`)
    }
  })

  const getUserById = vi.fn((userId: string) => {
    if (userThrows.includes(userId)) {
      return Promise.reject(new Error('fetch failed'))
    }
    if (userErrors[userId]) {
      return Promise.resolve({ data: { user: null }, error: userErrors[userId] })
    }
    return Promise.resolve({
      data: { user: userEmails[userId] ? { id: userId, email: userEmails[userId] } : null },
      // What Supabase actually returns for an id that is not there.
      error: userEmails[userId]
        ? null
        : { status: 404, code: 'user_not_found', message: 'User not found' },
    })
  })

  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  vi.mocked(createServiceRoleClient).mockReturnValue({
    from,
    auth: { admin: { getUserById } },
  } as never)

  return { from, notificationsInsert, notificationsSelect, notificationsUpdate, membersChain, getUserById }
}

function job(data: Partial<NotificationJobData> = {}, id = 'job-1'): Job<NotificationJobData> {
  return {
    id,
    data: {
      organizationId: ORG,
      type: 'post_call_summary',
      subjectId: CONVERSATION,
      ...data,
    },
  } as Job<NotificationJobData>
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'Frontdesk <notifications@example.com>'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com'
  batchSendMock.mockResolvedValue({ data: { data: [{ id: 'email-1' }] }, error: null })
  const { checkAndConsumeRateLimit, claimRateLimitCharge, rateLimitWindowSecondsRemaining } =
    await import('@/lib/voice/rate-limit')
  vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
  // Default: this notification has not been charged against the cap before.
  vi.mocked(claimRateLimitCharge).mockResolvedValue(true)
  vi.mocked(rateLimitWindowSecondsRemaining).mockResolvedValue(1_200)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('processNotification', () => {
  it('writes one row and sends one message per recipient in a single batch', async () => {
    const mocks = await mockClient({
      members: { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null },
      userEmails: { 'user-1': 'owner@example.com', 'user-2': 'staff@example.com' },
    })

    await processNotification(job())

    expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(mocks.notificationsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG,
        type: 'post_call_summary',
        dedupe_key: CONVERSATION,
        title: 'Call summary',
        link_path: '/conversations',
      })
    )

    expect(batchSendMock).toHaveBeenCalledTimes(1)
    const [payload, requestOptions] = batchSendMock.mock.calls[0]
    expect(payload).toHaveLength(2)
    expect(payload[0].to).toBe('owner@example.com')
    expect(payload[1].to).toBe('staff@example.com')
    expect(requestOptions).toEqual({
      batchValidation: 'permissive',
      idempotencyKey: 'notify:notif-1',
    })
  })

  // ── Round-2 issue 2 (decided): the toggles control email only ───────────
  //
  // They are labelled by channel ("Post-call summary — Email"), so switching
  // one off must stop the Resend call and leave the bell alone.
  describe('an email preference switched off', () => {
    it('still writes the in-app row, and makes no Resend call', async () => {
      const mocks = await mockClient({
        settings: { data: { ...ALL_ON, notify_post_call_summary: false }, error: null },
      })

      await processNotification(job())

      expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
      expect(mocks.notificationsInsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'post_call_summary', dedupe_key: CONVERSATION })
      )
      expect(batchSendMock).not.toHaveBeenCalled()
      // Round 3: terminal `skipped`, so the sweep (pending-only) never mails an opted-out org.
      expect(mocks.notificationsUpdate).toHaveBeenCalledTimes(1)
      expect(mocks.notificationsUpdate).toHaveBeenCalledWith({ email_status: 'skipped' })
    })

    it('never sends a row already settled as skipped when a job re-delivers it', async () => {
      const table = fakeNotificationsTable()
      const settings = { data: { ...ALL_ON, notify_post_call_summary: false }, error: null }
      await mockClient({ notificationsTable: table, settings })

      await processNotification(job())
      expect(table.rows[0].email_status).toBe('skipped')

      // Preference back on, same notification re-delivered: the settled row stays settled.
      settings.data = ALL_ON
      await processNotification(job({ sweepAttempt: 1 }, 'job-2'))

      expect(batchSendMock).not.toHaveBeenCalled()
      expect(table.rows).toHaveLength(1)
    })

    it('does the same for a reminder', async () => {
      const mocks = await mockClient({
        settings: { data: { ...ALL_ON, notify_appointment_reminders: false }, error: null },
        appointment: { data: dueReminderRow(), error: null },
      })

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))

      expect(mocks.notificationsInsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'appointment_reminder' })
      )
      expect(batchSendMock).not.toHaveBeenCalled()
    })

    it('writes the row and sends the email when the preference is on', async () => {
      const mocks = await mockClient()

      await processNotification(job())

      expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
      expect(batchSendMock).toHaveBeenCalledTimes(1)
    })
  })

  it('does not re-send when the claim already shows an email went out', async () => {
    const mocks = await mockClient({
      claimInsert: { data: null, error: { code: '23505', message: 'duplicate key' } },
      claimRead: { data: { id: 'notif-1', email_sent_at: '2026-08-03T18:00:05Z' }, error: null },
    })

    await processNotification(job())

    expect(mocks.notificationsSelect).toHaveBeenCalled()
    expect(batchSendMock).not.toHaveBeenCalled()
  })

  it('retries when the conflicting row is deleted between the insert and the read', async () => {
    await mockClient({
      claimInsert: { data: null, error: { code: '23505', message: 'duplicate key' } },
      claimRead: { data: null, error: null },
    })

    await expect(processNotification(job())).rejects.toThrow('Notification claim vanished')
    expect(batchSendMock).not.toHaveBeenCalled()
  })

  it('resolves recipients for the job organization only', async () => {
    const mocks = await mockClient({
      members: { data: [{ user_id: 'user-1' }], error: null },
      userEmails: { 'user-1': 'owner@example.com' },
    })

    await processNotification(job())

    expect(mocks.membersChain.eq).toHaveBeenCalledWith('organization_id', ORG)
    expect(mocks.membersChain.eq).toHaveBeenCalledTimes(1)
    const payload = batchSendMock.mock.calls[0][0]
    expect(payload.map((message: { to: string }) => message.to)).toEqual(['owner@example.com'])
  })

  it('refuses a subject row that belongs to another organization', async () => {
    await mockClient({
      conversation: { data: { ...CONVERSATION_ROW, organization_id: OTHER_ORG }, error: null },
    })

    await expect(processNotification(job())).rejects.toThrow(UnrecoverableError)
    expect(batchSendMock).not.toHaveBeenCalled()
  })

  it('skips a member whose email cannot be resolved and still mails the rest', async () => {
    await mockClient({
      members: { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null },
      userEmails: { 'user-1': 'owner@example.com', 'user-2': null },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await processNotification(job())

    const payload = batchSendMock.mock.calls[0][0]
    expect(payload).toHaveLength(1)
    expect(payload[0].to).toBe('owner@example.com')
    expect(warn).toHaveBeenCalledWith('[notifications] no email for member user-2')
    warn.mockRestore()
  })

  it('throws when the members read errors', async () => {
    await mockClient({ members: { data: null, error: { message: 'boom' } } })

    await expect(processNotification(job())).rejects.toThrow('Failed to resolve recipients')
  })

  it('completes without sending, and settles as skipped, when the org has no resolvable recipients', async () => {
    const mocks = await mockClient({ members: { data: [], error: null } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(processNotification(job())).resolves.toBeUndefined()
    expect(batchSendMock).not.toHaveBeenCalled()
    expect(mocks.notificationsUpdate).toHaveBeenCalledWith({ email_status: 'skipped' })
    warn.mockRestore()
  })

  it('marks the row sent with an explicit status once Resend accepts', async () => {
    const mocks = await mockClient()

    await processNotification(job())

    expect(mocks.notificationsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email_sent_at: expect.any(String), email_status: 'sent' })
    )
  })

  it('runs the sweep, not a delivery, for the scheduler job', async () => {
    const mocks = await mockClient()

    await processNotification({ id: 'repeat:1', name: 'notification-sweep', data: {} } as never)

    expect(runNotificationSweepMock).toHaveBeenCalledTimes(1)
    expect(mocks.notificationsInsert).not.toHaveBeenCalled()
  })

  it('throws UnrecoverableError on a malformed payload', async () => {
    await mockClient()

    await expect(
      processNotification(job({ subjectId: 'not-a-uuid' }))
    ).rejects.toThrow(UnrecoverableError)
  })

  it('completes silently when the subject row is gone', async () => {
    const mocks = await mockClient({ conversation: { data: null, error: null } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(processNotification(job())).resolves.toBeUndefined()
    expect(mocks.notificationsInsert).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('retries while the conversation is still active and sends nothing', async () => {
    const mocks = await mockClient({
      conversation: { data: { ...CONVERSATION_ROW, status: 'active' }, error: null },
    })

    await expect(processNotification(job())).rejects.toThrow('is not finalized yet')
    expect(mocks.notificationsInsert).not.toHaveBeenCalled()
    expect(batchSendMock).not.toHaveBeenCalled()
  })

  it('suppresses a reminder for a cancelled appointment but not the booking', async () => {
    await mockClient({
      appointment: { data: { ...APPOINTMENT_ROW, status: 'cancelled' }, error: null },
    })

    await processNotification(
      job({ type: 'appointment_reminder', subjectId: APPOINTMENT })
    )
    expect(batchSendMock).not.toHaveBeenCalled()

    await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }))
    expect(batchSendMock).toHaveBeenCalledTimes(1)
  })

  it('suppresses a reminder whose appointment has already started', async () => {
    await mockClient({
      appointment: {
        data: { ...APPOINTMENT_ROW, starts_at: new Date(Date.now() - 3_600_000).toISOString() },
        error: null,
      },
    })

    await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))

    expect(batchSendMock).not.toHaveBeenCalled()
  })

  it('renders the appointment time in the organization timezone', async () => {
    await mockClient({
      appointment: {
        data: {
          ...APPOINTMENT_ROW,
          starts_at: '2026-08-03T18:00:00+00:00',
          ends_at: '2026-08-03T19:00:00+00:00',
        },
        error: null,
      },
    })

    await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }))

    const html: string = batchSendMock.mock.calls[0][0][0].html
    expect(html).toContain('2:00 PM')
    expect(html).not.toContain('6:00 PM')
  })

  it('fails with the env names and leaves email_sent_at untouched when Resend is unconfigured', async () => {
    delete process.env.RESEND_API_KEY
    const mocks = await mockClient()

    await expect(processNotification(job())).rejects.toThrow(
      'Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)'
    )
    expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(mocks.notificationsUpdate).not.toHaveBeenCalled()
  })

  it('releases the lease and rethrows on a transient send failure', async () => {
    const mocks = await mockClient()
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'slow down', statusCode: 429 },
    })

    await expect(processNotification(job())).rejects.toThrow('Failed to send notification email')
    expect(mocks.notificationsUpdate).toHaveBeenCalledWith({
      email_claimed_at: null,
      email_claim_token: null,
    })
    // Never marked sent: the retry must re-send.
    expect(mocks.notificationsUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ email_sent_at: expect.any(String) })
    )
  })

  it('marks the row sent and completes when Resend reports the key was already used', async () => {
    const mocks = await mockClient()
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'invalid_idempotent_request', message: 'same key', statusCode: 400 },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(processNotification(job())).resolves.toBeUndefined()
    // The first request landed, so this is a delivered email, not a retry.
    expect(mocks.notificationsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email_sent_at: expect.any(String) })
    )
    expect(mocks.notificationsUpdate).not.toHaveBeenCalledWith({
      email_claimed_at: null,
      email_claim_token: null,
    })
    error.mockRestore()
  })

  it('throws UnrecoverableError on a permanent send failure', async () => {
    await mockClient()
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'daily_quota_exceeded', message: 'quota', statusCode: 429 },
    })

    await expect(processNotification(job())).rejects.toThrow(UnrecoverableError)
  })

  it('completes and logs member uuids when individual messages are rejected', async () => {
    await mockClient({
      members: { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null },
      userEmails: { 'user-1': 'owner@example.com', 'user-2': 'staff@example.com' },
    })
    batchSendMock.mockResolvedValue({
      data: { data: [{ id: 'email-1' }], errors: [{ index: 1, message: 'invalid' }] },
      error: null,
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(processNotification(job())).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('user-2'))
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('staff@example.com'))
    error.mockRestore()
  })

  it('completes without sending when another worker already owns the send', async () => {
    await mockClient({ emailClaim: { data: null, error: null } })

    await expect(processNotification(job())).resolves.toBeUndefined()
    expect(batchSendMock).not.toHaveBeenCalled()
  })

  it('writes the row but sends no email once the client_booking cap is reached', async () => {
    const mocks = await mockClient({
      appointment: { data: APPOINTMENT_ROW, error: null },
    })
    const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')
    vi.mocked(checkAndConsumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }))

    expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(batchSendMock).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not consume the cap for a staff booking', async () => {
    await mockClient({ appointment: { data: APPOINTMENT_ROW, error: null } })
    const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')

    await processNotification(job({ type: 'staff_booking', subjectId: APPOINTMENT }))

    expect(checkAndConsumeRateLimit).not.toHaveBeenCalled()
    expect(batchSendMock).toHaveBeenCalledTimes(1)
  })

  // ── Issue 2: a crash between the claim and the Resend call ──────────────
  //
  // The claim is a lease now, and `email_sent_at` is written only after the
  // provider has the message. With the old ordering the first attempt below
  // stamped `email_sent_at`, and the retry returned at step 9 without ever
  // calling Resend — the assertion that matters here is that the provider *is*
  // contacted on the retry.
  describe('a worker that dies between the claim and the send', () => {
    it('does not mark the row sent, and the retry reaches the provider', async () => {
      const mocks = await mockClient()
      // Attempt 1: the process dies inside the send.
      batchSendMock.mockRejectedValueOnce(new Error('ECONNRESET'))

      await expect(processNotification(job())).rejects.toThrow()
      expect(mocks.notificationsUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ email_sent_at: expect.any(String) })
      )

      // Attempt 2 sees `email_sent_at` still null, so step 9 does not short out.
      batchSendMock.mockClear()
      batchSendMock.mockResolvedValue({ data: { data: [{ id: 'email-1' }] }, error: null })
      await expect(processNotification(job())).resolves.toBeUndefined()

      expect(batchSendMock).toHaveBeenCalledTimes(1)
      expect(mocks.notificationsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ email_sent_at: expect.any(String) })
      )
    })

    it('presents the job id as the lease token so its own retry is not locked out', async () => {
      const mocks = await mockClient()

      await processNotification(job({}, 'job-77'))

      expect(mocks.notificationsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ email_claim_token: 'job:job-77' })
      )
    })
  })

  // ── Issue 4: transient Auth lookup failures ─────────────────────────────
  describe('recipient resolution failures', () => {
    it('throws without contacting the provider when an Auth lookup 500s', async () => {
      await mockClient({
        members: { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null },
        userEmails: { 'user-1': 'owner@example.com' },
        userErrors: { 'user-2': { status: 500, message: 'internal error' } },
      })

      await expect(processNotification(job())).rejects.toThrow('Failed to resolve recipient')
      // Not a partial send: nobody gets it on this attempt, and BullMQ retries.
      expect(batchSendMock).not.toHaveBeenCalled()
    })

    it('throws without contacting the provider when an Auth lookup rejects', async () => {
      await mockClient({
        members: { data: [{ user_id: 'user-1' }], error: null },
        userThrows: ['user-1'],
      })

      await expect(processNotification(job())).rejects.toThrow('fetch failed')
      expect(batchSendMock).not.toHaveBeenCalled()
    })

    it('leaves the row unsent when recipients cannot be resolved', async () => {
      const mocks = await mockClient({
        members: { data: [{ user_id: 'user-1' }], error: null },
        userErrors: { 'user-1': { status: 503, message: 'unavailable' } },
      })

      await expect(processNotification(job())).rejects.toThrow()
      expect(mocks.notificationsUpdate).not.toHaveBeenCalled()
    })

    it('still skips a user that genuinely does not exist', async () => {
      await mockClient({
        members: { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null },
        userEmails: { 'user-1': 'owner@example.com' },
        userErrors: { 'user-2': { status: 404, code: 'user_not_found', message: 'User not found' } },
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await processNotification(job())

      expect(batchSendMock.mock.calls[0][0]).toHaveLength(1)
      expect(warn).toHaveBeenCalledWith('[notifications] no email for member user-2')
      warn.mockRestore()
    })
  })

  // ── Issues 5 and 6: the client_booking cap ──────────────────────────────
  describe('the client_booking hourly cap', () => {
    it('charges the window once per notification, not once per attempt', async () => {
      await mockClient({ appointment: { data: APPOINTMENT_ROW, error: null } })
      const { checkAndConsumeRateLimit, claimRateLimitCharge } = await import(
        '@/lib/voice/rate-limit'
      )
      // Attempt 1 takes the marker; every later attempt finds it already taken.
      // Stateful rather than `mockResolvedValueOnce`, so an attempt that never
      // reaches the cap cannot leave a queued value behind for another test.
      const taken = new Set<string>()
      vi.mocked(claimRateLimitCharge).mockImplementation(async (key: string) => {
        if (taken.has(key)) return false
        taken.add(key)
        return true
      })
      batchSendMock.mockResolvedValueOnce({
        data: null,
        error: { name: 'rate_limit_exceeded', message: 'slow down', statusCode: 429 },
      })

      const bookingJob = job({ type: 'client_booking', subjectId: APPOINTMENT })
      await expect(processNotification(bookingJob)).rejects.toThrow()
      await processNotification(bookingJob)

      expect(checkAndConsumeRateLimit).toHaveBeenCalledTimes(1)
      expect(batchSendMock).toHaveBeenCalledTimes(2)
    })

    it('re-enqueues past the window boundary instead of dropping the email', async () => {
      await mockClient({ appointment: { data: APPOINTMENT_ROW, error: null } })
      const {
        checkAndConsumeRateLimit,
        releaseRateLimitCharge,
        rateLimitWindowSecondsRemaining,
      } = await import('@/lib/voice/rate-limit')
      vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
      vi.mocked(rateLimitWindowSecondsRemaining).mockResolvedValue(600)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }))

      expect(batchSendMock).not.toHaveBeenCalled()
      // The token was not really spent, so the next window starts clean.
      expect(releaseRateLimitCharge).toHaveBeenCalled()
      expect(queueAddMock).toHaveBeenCalledWith(
        'client_booking',
        expect.objectContaining({ subjectId: APPOINTMENT, capDeferrals: 1 }),
        // A job id that the still-active original cannot shadow.
        expect.objectContaining({
          jobId: `notify:client_booking:${APPOINTMENT}:defer1`,
          delay: 605_000,
        })
      )
      warn.mockRestore()
    })

    it('gives up after the deferral budget rather than re-enqueueing forever', async () => {
      await mockClient({ appointment: { data: APPOINTMENT_ROW, error: null } })
      const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')
      vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})

      await processNotification(
        job({ type: 'client_booking', subjectId: APPOINTMENT, capDeferrals: 3 })
      )

      expect(queueAddMock).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('capped windows'))
      warn.mockRestore()
      error.mockRestore()
    })
  })

  // ── Round-2 issue 1: a rescheduled appointment's second reminder ────────
  //
  // The reminder used to be claimed on the appointment id alone, so once the
  // first reminder was emailed, the job re-installed for the new time found
  // `email_sent_at` set and returned without contacting Resend.
  describe('a reminder for an appointment moved after its first reminder went out', () => {
    it('delivers a second reminder email for the new time', async () => {
      const table = fakeNotificationsTable()
      const appointment = { data: dueReminderRow({}, 23), error: null }
      await mockClient({ notificationsTable: table, appointment })

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))
      expect(batchSendMock).toHaveBeenCalledTimes(1)

      // Moved; the re-installed job fires 24h before the new time.
      appointment.data = dueReminderRow({}, 20)
      await processNotification(
        job({ type: 'appointment_reminder', subjectId: APPOINTMENT }, 'job-2')
      )

      // Delivered, not merely re-enqueued: Resend was called again, under an
      // idempotency key of its own so Resend does not fold it into the first.
      expect(batchSendMock).toHaveBeenCalledTimes(2)
      const [, first] = batchSendMock.mock.calls[0]
      const [, second] = batchSendMock.mock.calls[1]
      expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
      expect(table.rows).toHaveLength(2)
      expect(table.rows[1].dedupe_key).toBe(
        `${APPOINTMENT}:${new Date(appointment.data.starts_at).toISOString()}`
      )
    })

    it('keeps the first row as the record of its email, hidden from the bell', async () => {
      const table = fakeNotificationsTable()
      const appointment = { data: dueReminderRow({}, 23), error: null }
      await mockClient({ notificationsTable: table, appointment })

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))
      appointment.data = dueReminderRow({}, 20)
      await processNotification(
        job({ type: 'appointment_reminder', subjectId: APPOINTMENT }, 'job-2')
      )

      const [original, moved] = table.rows
      // Not deleted, not un-sent: the first reminder did go out.
      expect(original.email_sent_at).not.toBeNull()
      expect(original.superseded_at).not.toBeNull()
      // The bell (which filters `superseded_at is null`) shows only this one.
      expect(moved.superseded_at).toBeNull()
      expect(moved.email_sent_at).not.toBeNull()
    })

    it('does not re-send when the same time is delivered twice', async () => {
      const table = fakeNotificationsTable()
      await mockClient({
        notificationsTable: table,
        appointment: { data: dueReminderRow(), error: null },
      })

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))
      await processNotification(
        job({ type: 'appointment_reminder', subjectId: APPOINTMENT }, 'job-2')
      )

      expect(batchSendMock).toHaveBeenCalledTimes(1)
      expect(table.rows).toHaveLength(1)
      expect(table.rows[0].superseded_at).toBeNull()
    })

    it('skips a stale job that fires more than 24h before the appointment', async () => {
      const mocks = await mockClient({ appointment: { data: APPOINTMENT_ROW, error: null } })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // APPOINTMENT_ROW starts five days out: this job belonged to an earlier,
      // nearer time, and the job for the current time is still pending.
      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))

      expect(mocks.notificationsInsert).not.toHaveBeenCalled()
      expect(batchSendMock).not.toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  // ── Round-2 issue 3: a deferral shadowed by a failed job ────────────────
  it('replaces a failed deferral still parked under the same id', async () => {
    // BullMQ semantics: `add()` under an id that exists in any state is a no-op.
    const parked = new Map<string, string>([
      [`notify:client_booking:${APPOINTMENT}:defer1`, 'failed'],
    ])
    queueRemoveMock.mockImplementation(async (jobId: string) => {
      parked.delete(jobId)
    })
    queueAddMock.mockImplementation(
      async (_name: string, _data: unknown, opts: { jobId: string }) => {
        if (!parked.has(opts.jobId)) parked.set(opts.jobId, 'delayed')
      }
    )

    try {
      await mockClient({ appointment: { data: APPOINTMENT_ROW, error: null } })
      const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')
      vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }))

      expect(parked.get(`notify:client_booking:${APPOINTMENT}:defer1`)).toBe('delayed')
      warn.mockRestore()
    } finally {
      queueAddMock.mockReset()
      queueRemoveMock.mockReset()
    }
  })

  // ── Round-2 issue 4: a booking announced twice ──────────────────────────
  it('emails a booking once when creation and the call-end seam both deliver it', async () => {
    const table = fakeNotificationsTable()
    await mockClient({
      notificationsTable: table,
      appointment: { data: APPOINTMENT_ROW, error: null },
    })

    // The job from `createAppointmentServiceRole()`, then the seam's re-install.
    await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }))
    await processNotification(job({ type: 'client_booking', subjectId: APPOINTMENT }, 'job-2'))

    expect(batchSendMock).toHaveBeenCalledTimes(1)
    expect(table.rows).toHaveLength(1)
  })

  // ── Round-2 issue 6: reminders from public bookings are capped too ──────
  describe('the reminder cap for public-page bookings', () => {
    const PUBLIC = { agent_id: null, conversation_id: null, client_id: 'client-1' }

    it('charges a public booking reminder against its own window', async () => {
      await mockClient({ appointment: { data: dueReminderRow(PUBLIC), error: null } })
      const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))

      expect(checkAndConsumeRateLimit).toHaveBeenCalledWith(
        `notify:appointment_reminder:${ORG}`,
        expect.objectContaining({ max: 20 })
      )
      expect(batchSendMock).toHaveBeenCalledTimes(1)
    })

    it('defers the reminder email past the window when the cap is spent', async () => {
      const mocks = await mockClient({
        appointment: { data: dueReminderRow(PUBLIC), error: null },
      })
      const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')
      vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))

      expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
      expect(batchSendMock).not.toHaveBeenCalled()
      expect(queueAddMock).toHaveBeenCalledWith(
        'appointment_reminder',
        expect.objectContaining({ capDeferrals: 1 }),
        expect.objectContaining({ jobId: `notify:appointment_reminder:${APPOINTMENT}:defer1` })
      )
      warn.mockRestore()
    })

    it('does not cap a reminder for a voice or dashboard booking', async () => {
      await mockClient({
        appointment: {
          data: dueReminderRow({ agent_id: 'agent-1', conversation_id: null, client_id: 'c-1' }),
          error: null,
        },
      })
      const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')

      await processNotification(job({ type: 'appointment_reminder', subjectId: APPOINTMENT }))

      expect(checkAndConsumeRateLimit).not.toHaveBeenCalled()
      expect(batchSendMock).toHaveBeenCalledTimes(1)
    })
  })

  // ── Round-2 issue 13: the lease token is interpolated into a filter ─────
  it('refuses a lease token that could widen the PostgREST filter', async () => {
    const mocks = await mockClient()

    await expect(
      processNotification(job({}, 'x",email_claim_token.is.null'))
    ).rejects.toThrow('malformed notification lease token')
    expect(mocks.notificationsUpdate).not.toHaveBeenCalled()
    expect(batchSendMock).not.toHaveBeenCalled()
  })

  // ── Issue 9: a worker with no NEXT_PUBLIC_SITE_URL ──────────────────────
  it('fails loudly rather than mailing a localhost call-to-action link', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    const mocks = await mockClient()

    await expect(processNotification(job())).rejects.toThrow('NEXT_PUBLIC_SITE_URL')
    expect(batchSendMock).not.toHaveBeenCalled()
    expect(mocks.notificationsUpdate).not.toHaveBeenCalled()
  })
})

describe('describeNotificationJob', () => {
  it('names the type and subject', () => {
    expect(describeNotificationJob(job())).toBe(
      `type=post_call_summary subject=${CONVERSATION}`
    )
  })
})
