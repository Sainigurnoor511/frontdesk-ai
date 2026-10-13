import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { assertResendConfigured, sendNotificationEmails } from './send-notification-email'

const { batchSendMock, MockResend } = vi.hoisted(() => {
  const batchSendMock = vi.fn()
  class MockResend {
    batch = { send: batchSendMock }
  }
  return { batchSendMock, MockResend }
})

vi.mock('resend', () => ({
  Resend: MockResend,
}))

const ORIGINAL_ENV = { ...process.env }

const email = {
  organizationName: 'Smile & Co',
  subject: 'New booking — Smile & Co',
  heading: 'New booking',
  intro: 'Ada <script> · Monday, August 3, 2026 at 2:00 PM',
  details: [
    { label: 'Client', value: 'Ada <script>' },
    { label: 'Phone', value: '+14155551234' },
  ],
  ctaPath: '/calendar',
  ctaLabel: 'Open calendar',
}

describe('sendNotificationEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'Frontdesk <notifications@example.com>'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com'
    batchSendMock.mockResolvedValue({ data: { data: [{ id: 'email-1' }] }, error: null })
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('sends one message per recipient in a single batch request', async () => {
    const outcome = await sendNotificationEmails(
      ['owner@example.com', 'staff@example.com'],
      email,
      'notify:row-1'
    )

    expect(batchSendMock).toHaveBeenCalledTimes(1)
    const [payload, options] = batchSendMock.mock.calls[0]
    expect(payload).toHaveLength(2)
    expect(payload[0].to).toBe('owner@example.com')
    expect(payload[1].to).toBe('staff@example.com')
    expect(payload[0].from).toBe('Frontdesk <notifications@example.com>')
    expect(payload[0].subject).toBe('New booking — Smile & Co')
    expect(options).toEqual({ batchValidation: 'permissive', idempotencyKey: 'notify:row-1' })
    expect(outcome).toEqual({ status: 'sent', failedIndices: [] })
  })

  it('builds table-based HTML with inline styles and no style block', async () => {
    await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    const html: string = batchSendMock.mock.calls[0][0][0].html
    expect(html).toContain('<table')
    expect(html).toContain('style=')
    expect(html).not.toContain('<style')
    expect(html).toContain('Client')
    expect(html).toContain('https://app.example.com/calendar')
    expect(html).toContain('Open calendar')
  })

  it('escapes interpolated values', async () => {
    await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    const html: string = batchSendMock.mock.calls[0][0][0].html
    expect(html).toContain('Smile &amp; Co')
    expect(html).toContain('Ada &lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('reports per-message rejections as failed indices', async () => {
    batchSendMock.mockResolvedValue({
      data: { data: [{ id: 'email-1' }], errors: [{ index: 1, message: 'invalid address' }] },
      error: null,
    })

    const outcome = await sendNotificationEmails(
      ['owner@example.com', 'broken@example.com'],
      email,
      'notify:row-1'
    )

    expect(outcome).toEqual({ status: 'sent', failedIndices: [1] })
  })

  it('classifies a rate limit as retryable', async () => {
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'too many requests', statusCode: 429 },
    })

    const outcome = await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    expect(outcome.status).toBe('retry')
  })

  it('classifies a reused idempotency key as already sent', async () => {
    batchSendMock.mockResolvedValue({
      data: null,
      error: {
        name: 'invalid_idempotent_request',
        message: 'same key, different payload',
        statusCode: 400,
      },
    })

    const outcome = await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    expect(outcome.status).toBe('already_sent')
  })

  it('classifies a concurrent idempotent request as already sent', async () => {
    batchSendMock.mockResolvedValue({
      data: null,
      error: {
        name: 'concurrent_idempotent_requests',
        message: 'in flight',
        statusCode: 409,
      },
    })

    const outcome = await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    expect(outcome.status).toBe('already_sent')
  })

  it('classifies a quota error as permanent', async () => {
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'daily_quota_exceeded', message: 'quota', statusCode: 429 },
    })

    const outcome = await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    expect(outcome.status).toBe('permanent')
  })

  it('classifies a thrown network error as retryable', async () => {
    batchSendMock.mockRejectedValueOnce(new Error('socket hang up'))

    const outcome = await sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')

    expect(outcome).toEqual({
      status: 'retry',
      message: 'Failed to send notification email: socket hang up',
    })
  })

  it('throws when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY

    await expect(
      sendNotificationEmails(['owner@example.com'], email, 'notify:row-1')
    ).rejects.toThrow('Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)')
    expect(batchSendMock).not.toHaveBeenCalled()
  })
})

describe('assertResendConfigured', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('passes when both env vars are set', () => {
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'Frontdesk <notifications@example.com>'
    expect(() => assertResendConfigured()).not.toThrow()
  })

  it('names both env vars when one is missing', () => {
    process.env.RESEND_API_KEY = 're_test_key'
    delete process.env.RESEND_FROM_EMAIL
    expect(() => assertResendConfigured()).toThrow(
      'Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)'
    )
  })
})
