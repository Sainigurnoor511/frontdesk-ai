import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reconcileAppointmentReminders } from './reconcile-reminders'

const { redisMock } = vi.hoisted(() => ({
  redisMock: { set: vi.fn(), del: vi.fn() },
}))

vi.mock('@/lib/queue/connection', () => ({ redisConnection: redisMock }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/notifications/dispatch', () => ({
  scheduleAppointmentReminder: vi.fn(),
}))

vi.mock('@/lib/data/organization-settings-service', () => ({
  getNotificationPreferences: vi.fn(),
}))

const ALL_ON = {
  notifyPostCallSummary: true,
  notifyAppointmentReminders: true,
  notifyClientBookings: true,
  notifyStaffBookings: true,
}

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

beforeEach(async () => {
  vi.clearAllMocks()
  redisMock.set.mockResolvedValue('OK')
  redisMock.del.mockResolvedValue(1)
  const { getNotificationPreferences } = await import('@/lib/data/organization-settings-service')
  vi.mocked(getNotificationPreferences).mockResolvedValue(ALL_ON)
})

describe('reconcileAppointmentReminders', () => {
  /**
   * Issue 1, the rollout half: reminders are only ever enqueued by a write, so
   * without this every appointment booked before the feature shipped goes
   * unreminded forever.
   */
  it('schedules a reminder for each future appointment', async () => {
    await mockRows({
      data: [
        { id: 'appt-1', organization_id: 'org-1', starts_at: FAR_FUTURE },
        { id: 'appt-2', organization_id: 'org-1', starts_at: FAR_FUTURE },
      ],
      error: null,
    })
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await expect(reconcileAppointmentReminders()).resolves.toEqual({ scheduled: 2, scanned: 2 })
    expect(scheduleAppointmentReminder).toHaveBeenCalledWith(
      'org-1',
      'appt-1',
      FAR_FUTURE,
      ALL_ON
    )
  })

  it('reads preferences once per organization, not once per appointment', async () => {
    await mockRows({
      data: [
        { id: 'appt-1', organization_id: 'org-1', starts_at: FAR_FUTURE },
        { id: 'appt-2', organization_id: 'org-1', starts_at: FAR_FUTURE },
        { id: 'appt-3', organization_id: 'org-2', starts_at: FAR_FUTURE },
      ],
      error: null,
    })
    const { getNotificationPreferences } = await import(
      '@/lib/data/organization-settings-service'
    )

    await reconcileAppointmentReminders()

    expect(getNotificationPreferences).toHaveBeenCalledTimes(2)
  })

  it('skips organizations that have reminders switched off', async () => {
    await mockRows({
      data: [{ id: 'appt-1', organization_id: 'org-1', starts_at: FAR_FUTURE }],
      error: null,
    })
    const { getNotificationPreferences } = await import(
      '@/lib/data/organization-settings-service'
    )
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      ...ALL_ON,
      notifyAppointmentReminders: false,
    })
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await expect(reconcileAppointmentReminders()).resolves.toEqual({ scheduled: 0, scanned: 1 })
    expect(scheduleAppointmentReminder).not.toHaveBeenCalled()
  })

  it('runs once: a second boot finds the guard taken and reads nothing', async () => {
    const { chain } = await mockRows({ data: [], error: null })
    redisMock.set.mockResolvedValue(null)

    await expect(reconcileAppointmentReminders()).resolves.toEqual({ skipped: true })
    expect(chain.select).not.toHaveBeenCalled()
  })

  it('releases the guard on failure so the next boot retries', async () => {
    await mockRows({ data: null, error: { message: 'boom' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(reconcileAppointmentReminders()).resolves.toEqual({ skipped: true })
    expect(redisMock.del).toHaveBeenCalled()
    error.mockRestore()
  })
})
