import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchWebhook, deliverWebhook, getWebhookConfig } from './webhook'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/queue/queues/webhook', () => ({
  webhookQueue: {
    add: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWebhookConfig', () => {
  it('returns null when the integration is disabled', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { is_enabled: false, config: {} },
    })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await expect(getWebhookConfig('org-1')).resolves.toBeNull()
  })

  it('returns the parsed config when enabled', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        is_enabled: true,
        config: {
          url: 'https://hooks.example.com/receptionist',
          events: ['appointment.created', 'conversation.completed'],
          secret: 's3cret',
        },
      },
    })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await expect(getWebhookConfig('org-1')).resolves.toEqual({
      url: 'https://hooks.example.com/receptionist',
      events: ['appointment.created', 'conversation.completed'],
      secret: 's3cret',
    })
  })
})

describe('dispatchWebhook', () => {
  it('enqueues a delivery job when configured for the event', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const { webhookQueue } = await import('@/lib/queue/queues/webhook')
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        is_enabled: true,
        config: {
          url: 'https://hooks.example.com/receptionist',
          events: ['appointment.created'],
        },
      },
    })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await dispatchWebhook('org-1', 'appointment.created', { appointmentId: 'appt-1' })

    expect(webhookQueue.add).toHaveBeenCalledWith(
      'deliver',
      {
        organizationId: 'org-1',
        event: 'appointment.created',
        data: { appointmentId: 'appt-1' },
      }
    )
  })

  it('skips when the event is not subscribed', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const { webhookQueue } = await import('@/lib/queue/queues/webhook')
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        is_enabled: true,
        config: {
          url: 'https://hooks.example.com/receptionist',
          events: ['conversation.completed'],
        },
      },
    })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await dispatchWebhook('org-1', 'appointment.created', { appointmentId: 'appt-1' })

    expect(webhookQueue.add).not.toHaveBeenCalled()
  })
})

describe('deliverWebhook', () => {
  it('sends a signed JSON payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response)

    await deliverWebhook(
      { url: 'https://hooks.example.com/receptionist', events: ['appointment.created'], secret: 's3cret' },
      { organizationId: 'org-1', event: 'appointment.created', data: { appointmentId: 'appt-1' } }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com/receptionist',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Frontdesk-Signature': expect.stringMatching(/^sha256=/),
        }),
      })
    )
    fetchMock.mockRestore()
  })
})
