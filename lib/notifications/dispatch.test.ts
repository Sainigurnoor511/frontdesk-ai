// Imports the real dispatch module *and* the real queue module, so this suite is
// also the `server-only` canary for the enqueue path: it mocks one level lower,
// at `lib/queue/lazy-queue`, rather than mocking the queue itself.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cancelAppointmentReminder,
  dispatchConversationCompletedNotifications,
  dispatchConversationCompletedNotificationsBounded,
  dispatchNotification,
  scheduleAppointmentReminder,
} from './dispatch'
import {
  notificationQueue,
  POST_CALL_SUMMARY_ATTEMPTS,
  POST_CALL_SUMMARY_DELAY_MS,
} from '@/lib/queue/queues/notification'

const { addMock, removeMock } = vi.hoisted(() => ({ addMock: vi.fn(), removeMock: vi.fn() }))

vi.mock('@/lib/queue/lazy-queue', () => ({
  lazyQueue: () => ({ add: addMock, remove: removeMock }),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

const ALL_ON = {
  notify_post_call_summary: true,
  notify_appointment_reminders: true,
  notify_client_bookings: true,
  notify_staff_bookings: true,
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

async function mockClient({
  settings = { data: ALL_ON, error: null } as unknown,
  appointments = { data: [], error: null } as unknown,
}: { settings?: unknown; appointments?: unknown } = {}) {
  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  const from = vi.fn((table: string) => {
    if (table === 'organization_settings') return chain(settings)
    if (table === 'appointments') return chain(appointments)
    throw new Error(`Unexpected table: ${table}`)
  })
  vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)
  return { from }
}

const PREFERENCE_CASES = [
  { type: 'post_call_summary', column: 'notify_post_call_summary' },
  { type: 'client_booking', column: 'notify_client_bookings' },
  { type: 'staff_booking', column: 'notify_staff_bookings' },
] as const

function eventFor(type: (typeof PREFERENCE_CASES)[number]['type']) {
  return type === 'post_call_summary'
    ? ({ type, organizationId: 'org-1', conversationId: 'conv-1' } as const)
    : ({ type, organizationId: 'org-1', appointmentId: 'appt-1' } as const)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dispatchNotification', () => {
  it.each(PREFERENCE_CASES)('enqueues $type when the preference is on', async ({ type }) => {
    await mockClient()

    await dispatchNotification(eventFor(type))

    expect(notificationQueue.add).toHaveBeenCalledTimes(1)
    expect(addMock).toHaveBeenCalledWith(
      type,
      {
        organizationId: 'org-1',
        type,
        subjectId: type === 'post_call_summary' ? 'conv-1' : 'appt-1',
      },
      expect.objectContaining({
        jobId: `notify:${type}:${type === 'post_call_summary' ? 'conv-1' : 'appt-1'}`,
      })
    )
  })

  // Round-2 issue 2 (decided): the toggles are labelled "Email", so they gate
  // the email only. The in-app row needs the job whatever they say; the
  // processor reads the preference at delivery and decides only about Resend.
  it.each(PREFERENCE_CASES)(
    'still enqueues $type with its email preference off, without reading it',
    async ({ type, column }) => {
      const { from } = await mockClient({
        settings: { data: { ...ALL_ON, [column]: false }, error: null },
      })

      await dispatchNotification(eventFor(type))

      expect(addMock).toHaveBeenCalledTimes(1)
      expect(from).not.toHaveBeenCalled()
    }
  )

  it('delays only the post-call summary, and widens its attempt window', async () => {
    await mockClient()

    await dispatchNotification(eventFor('post_call_summary'))
    expect(addMock.mock.calls[0][2]).toMatchObject({
      delay: POST_CALL_SUMMARY_DELAY_MS,
      // Issue 7: the attempt window is the budget the finalize path gets before
      // the job lands in the failed set.
      attempts: POST_CALL_SUMMARY_ATTEMPTS,
    })

    addMock.mockClear()
    await dispatchNotification(eventFor('client_booking'))
    expect(addMock.mock.calls[0][2].delay).toBeUndefined()
    expect(addMock.mock.calls[0][2].attempts).toBeUndefined()
  })

  // Issue 7: a job parked under the fixed id — failed, delayed or completed —
  // makes `add()` a no-op, so a re-finalized conversation would never be
  // announced. Every install clears the stale job first.
  it('clears any job already parked under the fixed id before adding', async () => {
    await mockClient()

    await dispatchNotification(eventFor('post_call_summary'))

    expect(removeMock).toHaveBeenCalledWith('notify:post_call_summary:conv-1')
    expect(removeMock.mock.invocationCallOrder[0]).toBeLessThan(
      addMock.mock.invocationCallOrder[0]
    )
  })

  it('still enqueues when clearing the stale job fails', async () => {
    await mockClient()
    removeMock.mockRejectedValueOnce(new Error('locked by another worker'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await dispatchNotification(eventFor('client_booking'))

    expect(addMock).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('swallows a failing enqueue instead of throwing into the caller', async () => {
    await mockClient()
    addMock.mockRejectedValueOnce(new Error('redis down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(dispatchNotification(eventFor('post_call_summary'))).resolves.toBeUndefined()
    error.mockRestore()
  })
})

describe('scheduleAppointmentReminder', () => {
  const farFuture = new Date(Date.now() + 5 * 86_400_000).toISOString()

  it('schedules a delayed job when reminders are on', async () => {
    await mockClient()

    await scheduleAppointmentReminder('org-1', 'appt-1', farFuture)

    expect(addMock).toHaveBeenCalledTimes(1)
    const [name, payload, options] = addMock.mock.calls[0]
    expect(name).toBe('appointment_reminder')
    expect(payload).toEqual({
      organizationId: 'org-1',
      type: 'appointment_reminder',
      subjectId: 'appt-1',
    })
    expect(options.jobId).toBe('notify:appointment_reminder:appt-1')
    expect(options.delay).toBeGreaterThan(0)
  })

  // Round-2 issue 2: "Appointment reminders — Email · 24h before" switched off
  // stops the email, not the in-app reminder, so the job is still installed.
  it('still schedules the reminder when the reminder email is off', async () => {
    const { from } = await mockClient({
      settings: { data: { ...ALL_ON, notify_appointment_reminders: false }, error: null },
    })

    await scheduleAppointmentReminder('org-1', 'appt-1', farFuture)

    expect(addMock).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
  })

  it('skips a booking less than 24 hours out', async () => {
    await mockClient()

    await scheduleAppointmentReminder(
      'org-1',
      'appt-1',
      new Date(Date.now() + 3 * 3_600_000).toISOString()
    )

    expect(addMock).not.toHaveBeenCalled()
  })

  /**
   * Issue 1, the trap. The job id is fixed at
   * `notify:appointment_reminder:<id>`, so BullMQ treats a re-add as a no-op
   * while the original delayed job is still pending: calling this from the
   * reschedule paths *looks* like it works and does not. The old job has to go
   * first.
   */
  describe('rescheduling an appointment that already has a pending reminder', () => {
    it('removes the pending job before installing one at the new delay', async () => {
      await mockClient()

      const movedLater = new Date(Date.now() + 10 * 86_400_000).toISOString()
      await scheduleAppointmentReminder('org-1', 'appt-1', movedLater)

      expect(removeMock).toHaveBeenCalledWith('notify:appointment_reminder:appt-1')
      expect(removeMock.mock.invocationCallOrder[0]).toBeLessThan(
        addMock.mock.invocationCallOrder[0]
      )

      const delay = addMock.mock.calls[0][2].delay
      const expected = Date.parse(movedLater) - 24 * 3_600_000 - Date.now()
      // ~9 days out, not the ~4 days the original job was holding.
      expect(Math.abs(delay - expected)).toBeLessThan(2_000)
    })

    it('removes the pending job when the appointment moves inside the 24h window', async () => {
      await mockClient()

      await scheduleAppointmentReminder(
        'org-1',
        'appt-1',
        new Date(Date.now() + 2 * 3_600_000).toISOString()
      )

      // Nothing to remind about any more — and the old job must not stand.
      expect(addMock).not.toHaveBeenCalled()
      expect(removeMock).toHaveBeenCalledWith('notify:appointment_reminder:appt-1')
    })
  })

  it('warns and skips an unparseable start time', async () => {
    await mockClient()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await scheduleAppointmentReminder('org-1', 'appt-1', 'not-a-date')

    expect(addMock).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('cancelAppointmentReminder', () => {
  it('removes the pending reminder job', async () => {
    await cancelAppointmentReminder('appt-1')

    expect(removeMock).toHaveBeenCalledWith('notify:appointment_reminder:appt-1')
    expect(addMock).not.toHaveBeenCalled()
  })

  it('never throws when the queue is unreachable', async () => {
    removeMock.mockRejectedValueOnce(new Error('redis down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(cancelAppointmentReminder('appt-1')).resolves.toBeUndefined()
    warn.mockRestore()
  })
})

describe('dispatchConversationCompletedNotifications', () => {
  const farFuture = new Date(Date.now() + 5 * 86_400_000).toISOString()

  it('dispatches the summary plus a booking per appointment, reading no preferences', async () => {
    const { from } = await mockClient({
      appointments: {
        data: [
          { id: 'appt-1', starts_at: farFuture },
          // Cancellation does not suppress a booking notification; only the
          // reminder is suppressed, at delivery time.
          { id: 'appt-2', starts_at: farFuture },
        ],
        error: null,
      },
    })

    await dispatchConversationCompletedNotifications('org-1', 'conv-1', 'completed')

    const settingsReads = from.mock.calls.filter(([table]) => table === 'organization_settings')
    expect(settingsReads).toHaveLength(0)

    const names = addMock.mock.calls.map(([name]) => name)
    expect(names).toEqual([
      'post_call_summary',
      'client_booking',
      'appointment_reminder',
      'client_booking',
      'appointment_reminder',
    ])
  })

  it('dispatches the booking half but no summary for a failed call', async () => {
    await mockClient({
      appointments: { data: [{ id: 'appt-1', starts_at: farFuture }], error: null },
    })

    await dispatchConversationCompletedNotifications('org-1', 'conv-1', 'failed')

    const names = addMock.mock.calls.map(([name]) => name)
    expect(names).toEqual(['client_booking', 'appointment_reminder'])
  })

  it('resolves without throwing when the appointments query rejects', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const rejecting: Record<string, unknown> = {}
    rejecting.select = vi.fn(() => rejecting)
    rejecting.eq = vi.fn(() => rejecting)
    rejecting.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.reject(new Error('appointments read failed')).then(resolve, reject)
    const from = vi.fn((table: string) =>
      table === 'organization_settings' ? chain({ data: ALL_ON, error: null }) : rejecting
    )
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      dispatchConversationCompletedNotifications('org-1', 'conv-1', 'completed')
    ).resolves.toBeUndefined()
    // The summary — requirement 1's headline trigger — is enqueued before the
    // lookup, so it survives the lookup failing.
    expect(addMock.mock.calls.map(([name]) => name)).toEqual(['post_call_summary'])
    error.mockRestore()
  })
})

/**
 * Round-2 issue 4. A voice booking is now dispatched where it is written, and
 * the call-end seam re-dispatches it as a backstop. The repeat must collapse:
 * same fixed job ids, so a queue modelled on BullMQ's "add under an existing id
 * is a no-op" ends with one job per notification. (The processor half — a
 * second delivery of the same row sends no second email — is in
 * `lib/queue/processors/notification.test.ts`.)
 */
describe('a voice booking dispatched at creation and again by the call-end seam', () => {
  const farFuture = new Date(Date.now() + 5 * 86_400_000).toISOString()

  it('leaves exactly one job per notification', async () => {
    const jobs = new Map<string, unknown>()
    addMock.mockImplementation(async (_name: string, data: unknown, opts: { jobId: string }) => {
      if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, data)
    })
    removeMock.mockImplementation(async (jobId: string) => {
      jobs.delete(jobId)
    })

    try {
      await mockClient({
        appointments: { data: [{ id: 'appt-1', starts_at: farFuture }], error: null },
      })

      // `createAppointmentServiceRole()`, mid-call.
      await dispatchNotification({
        type: 'client_booking',
        organizationId: 'org-1',
        appointmentId: 'appt-1',
      })
      await scheduleAppointmentReminder('org-1', 'appt-1', farFuture)
      // The terminal conversation write.
      await dispatchConversationCompletedNotifications('org-1', 'conv-1', 'completed')

      expect([...jobs.keys()].sort()).toEqual([
        'notify:appointment_reminder:appt-1',
        'notify:client_booking:appt-1',
        'notify:post_call_summary:conv-1',
      ])
    } finally {
      addMock.mockReset()
      removeMock.mockReset()
    }
  })
})

describe('dispatchConversationCompletedNotificationsBounded', () => {
  it('resolves on the budget when the enqueue never settles', async () => {
    vi.useFakeTimers()
    await mockClient()
    // Redis unreachable: ioredis queues the command and never settles it.
    addMock.mockImplementationOnce(() => new Promise(() => {}))

    let settled = false
    const promise = dispatchConversationCompletedNotificationsBounded(
      'org-1',
      'conv-1',
      'completed'
    ).then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(3_000)
    await promise

    expect(settled).toBe(true)
    vi.useRealTimers()
  })
})
