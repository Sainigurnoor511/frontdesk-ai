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
}))

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

/** Minimal PostgREST-shaped chain: thenable, and terminal through single/maybeSingle. */
function chain(result: unknown) {
  const node: Record<string, unknown> = {}
  for (const key of ['select', 'eq', 'order', 'limit', 'is', 'in']) {
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
  /** Result of the conditional `email_sent_at` update (the send claim). */
  emailClaim?: unknown
  userEmails?: Record<string, string | null>
}

async function mockClient(options: ClientOptions = {}) {
  const {
    settings = { data: ALL_ON, error: null },
    conversation = { data: CONVERSATION_ROW, error: null },
    appointment = { data: APPOINTMENT_ROW, error: null },
    members = { data: [{ user_id: 'user-1' }], error: null },
    claimInsert = { data: { id: 'notif-1', email_sent_at: null }, error: null },
    claimRead = { data: { id: 'notif-1', email_sent_at: null }, error: null },
    emailClaim = { data: { id: 'notif-1' }, error: null },
    userEmails = { 'user-1': 'owner@example.com' },
  } = options

  const notificationsInsert = vi.fn(() => chain(claimInsert))
  const notificationsSelect = vi.fn(() => chain(claimRead))
  const notificationsUpdate = vi.fn((patch: Record<string, unknown>) =>
    chain(patch.email_sent_at === null ? { data: null, error: null } : emailClaim)
  )
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
        return {
          insert: notificationsInsert,
          select: notificationsSelect,
          update: notificationsUpdate,
        }
      default:
        throw new Error(`Unexpected table: ${table}`)
    }
  })

  const getUserById = vi.fn((userId: string) =>
    Promise.resolve({
      data: { user: userEmails[userId] ? { id: userId, email: userEmails[userId] } : null },
      error: userEmails[userId] ? null : { message: 'not found' },
    })
  )

  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  vi.mocked(createServiceRoleClient).mockReturnValue({
    from,
    auth: { admin: { getUserById } },
  } as never)

  return { from, notificationsInsert, notificationsSelect, notificationsUpdate, membersChain, getUserById }
}

function job(data: Partial<NotificationJobData> = {}): Job<NotificationJobData> {
  return {
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
  const { checkAndConsumeRateLimit } = await import('@/lib/voice/rate-limit')
  vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
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

  it('sends nothing and writes nothing when the preference is off', async () => {
    const mocks = await mockClient({
      settings: { data: { ...ALL_ON, notify_post_call_summary: false }, error: null },
    })

    await processNotification(job())

    expect(mocks.notificationsInsert).not.toHaveBeenCalled()
    expect(batchSendMock).not.toHaveBeenCalled()
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

  it('completes without sending when the org has no resolvable recipients', async () => {
    await mockClient({ members: { data: [], error: null } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(processNotification(job())).resolves.toBeUndefined()
    expect(batchSendMock).not.toHaveBeenCalled()
    warn.mockRestore()
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

  it('releases the claim and rethrows on a transient send failure', async () => {
    const mocks = await mockClient()
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'slow down', statusCode: 429 },
    })

    await expect(processNotification(job())).rejects.toThrow('Failed to send notification email')
    expect(mocks.notificationsUpdate).toHaveBeenCalledWith({ email_sent_at: null })
  })

  it('keeps the claim and completes when Resend reports the key was already used', async () => {
    const mocks = await mockClient()
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'invalid_idempotent_request', message: 'same key', statusCode: 400 },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(processNotification(job())).resolves.toBeUndefined()
    expect(mocks.notificationsUpdate).not.toHaveBeenCalledWith({ email_sent_at: null })
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
})

describe('describeNotificationJob', () => {
  it('names the type and subject', () => {
    expect(describeNotificationJob(job())).toBe(
      `type=post_call_summary subject=${CONVERSATION}`
    )
  })
})
