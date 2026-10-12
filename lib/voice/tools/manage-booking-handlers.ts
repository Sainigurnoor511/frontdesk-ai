import {
  cancelAppointmentByEmailServiceRole,
  findClientAppointmentsByEmailServiceRole,
  rescheduleAppointmentByEmailServiceRole,
  type AppointmentRow,
} from '@/lib/data/booking-service'
import { getAvailableSlots, type DaySlots } from '@/lib/data/availability-engine'
import {
  cancelVoiceAppointmentSchema,
  findVoiceAppointmentSchema,
  rescheduleVoiceAppointmentSchema,
} from '@/lib/validations/booking'
import { defineVoiceTool, type VoiceToolContext, type VoiceToolHandler } from './types'

/**
 * Looking up, cancelling, and moving an appointment the caller already has.
 *
 * ## Identification rule
 *
 * **Credentials — both required, both from trusted state or the caller's own
 * mouth:** (1) the organization, taken from `VoiceToolContext` and never from an
 * argument; (2) the caller's email address, matched case-insensitively against
 * `clients.email` within that org. **This pair is the whole of the
 * authorization check.** It is the same strength the public manage-booking page
 * offers the same person for the same appointments — note that page has no rate
 * limit and no live Turnstile check either, so "parity" is a statement about
 * exposure, not about it being well protected. A stronger rule needs caller ID
 * on `conversations` or an OTP flow; both are out of scope here (see
 * `developer-docs/TODO.md`).
 *
 * Because a single caller-spoken factor is all there is, these three tools are
 * **withheld entirely** from an agent with `secure_mode` or
 * `identity_verification_enabled` on. That gate lives in
 * `manageBookingToolsAllowed()` in `lib/voice/tool-handlers.ts`, so a withheld
 * tool is absent from the model's tool list *and* answers `unknown_tool` if it
 * is called anyway. It is not a sentence in the system prompt.
 *
 * **Conversational precondition — not a credential:** (3) the appointment's
 * current start time, which the caller stated on the call. The model can copy
 * this out of a `find_appointment` result, so it proves nothing about identity.
 * It is required because it keeps the agent from mutating an appointment the
 * caller never named, and because a wrong stated time routes to
 * `confirm_appointment` instead of a write.
 *
 * **`appointmentId` is an optional disambiguator only** — it is applied to the
 * set already narrowed by org + email + time, and an id that does not belong to
 * that set returns `appointment_not_found` with no write. An appointment id can
 * therefore never, on its own, reach a write.
 *
 * Defense in depth sits one layer down: the service functions re-run their own
 * `assertAppointmentOwnedByEmail` check and carry `.eq('organization_id', …)` on
 * the update, so three independent layers have to be wrong for a cross-tenant
 * write to land.
 *
 * All behavior is a thin conversational layer over the service-role functions
 * that back the public manage-booking flow, so the `appointment.cancelled`
 * webhook and the four calendar sync paths fire identically regardless of entry
 * point. (Reschedule fires no webhook because `appointment.updated` is not in
 * `WEBHOOK_EVENT_TYPES` — parity with the public page, backlogged.)
 */

/** How far back the lookup reads, so past and cancelled rows get distinct error codes. */
const LOOKBACK_DAYS = 30
/** Rows read per lookup. See the row-budget note in the design: one client of one SMB. */
const LOOKUP_ROW_LIMIT = 100
/** Candidates read back to the caller, in every candidate-bearing result. */
const CANDIDATE_LIMIT = 5
/** Alternative times offered on `slot_unavailable` — bounded so the agent doesn't read out a wall of times. */
const ALTERNATIVE_LIMIT = 3
/** UTC days the engine is asked for on a reschedule: the requested day plus two, one round trip. */
const RESCHEDULE_WINDOW_DAYS = 2

export type AppointmentBrief = {
  appointmentId: string
  title: string
  startsAt: string
  endsAt: string
  durationMinutes: number
  summary: string
}

const spokenTimeFormat = new Intl.DateTimeFormat('en-US', {
  // UTC because `buildSystemPrompt` already tells the agent that appointment
  // times and opening hours are UTC and the availability engine generates slots
  // in UTC. `timeZoneName: 'short'` so the spoken string itself carries "UTC"
  // rather than relying on the prompt. Per-org timezone rendering is a
  // system-wide change, backlogged.
  timeZone: 'UTC',
  timeZoneName: 'short',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** e.g. 'Haircut on Wednesday, August 5 at 2:00 PM UTC' */
export function describeAppointment(row: AppointmentRow): string {
  return `${row.title} on ${spokenTimeFormat.format(new Date(row.starts_at))}`
}

/** e.g. 'Wednesday, August 5 at 2:00 PM UTC' */
function describeTime(iso: string): string {
  return spokenTimeFormat.format(new Date(iso))
}

/** Sorted soonest-first, capped, mapped to the one candidate shape the model sees everywhere. */
export function describeMany(rows: AppointmentRow[], limit = CANDIDATE_LIMIT): AppointmentBrief[] {
  return [...rows]
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, limit)
    .map((row) => ({
      appointmentId: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      durationMinutes: Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000),
      summary: describeAppointment(row),
    }))
}

/** Instant -> 'YYYY-MM-DD' in UTC. */
export function utcDateOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/** Calendar arithmetic in UTC, because string slicing does not survive month boundaries. */
export function utcDatePlus(dateIso: string, days: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isoMinusDays(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

/**
 * Whether the model's `startsAt` carries no time of day, which is the only case
 * where the resolver may widen from "that instant" to "that date".
 *
 * Decided on the literal, not the instant, for two reasons.
 *
 * 1. `2026-08-04T00:00:00+05:00` is midnight in the caller's offset, not UTC, so
 *    it is a specific time and must take the confirm path. The system prompt
 *    already instructs the model to pass UTC.
 * 2. This predicate cannot distinguish "the caller gave only a date" from "the
 *    appointment genuinely starts at midnight UTC" — `2026-08-05T00:00:00Z` is
 *    both. That is safe because the resolver consults exact instant matches
 *    first: a real midnight-UTC appointment matches as an instant and never
 *    reaches this fallback, which is only taken when nothing at all is booked at
 *    the stated instant.
 */
export function isDateOnlyIntent(iso: string): boolean {
  return /T00:00:00(\.0{1,3})?(Z|\+00:00)$/i.test(iso)
}

type FreeRange = { startMs: number; endMs: number }

/**
 * Sorted, maximal, contiguous free ranges. Slots overlap when
 * `booking_slot_interval_minutes` is smaller than the slot duration, so the
 * merge is not optional.
 */
export function mergeFreeRanges(slots: { startsAt: string; endsAt: string }[]): FreeRange[] {
  const ranges = slots
    .map((slot) => ({ startMs: Date.parse(slot.startsAt), endMs: Date.parse(slot.endsAt) }))
    .sort((a, b) => a.startMs - b.startMs)

  const merged: FreeRange[] = []
  for (const range of ranges) {
    const current = merged[merged.length - 1]
    if (current && range.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, range.endMs)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

/**
 * True when `[startsAt, endsAt)` sits wholly inside one merged free range.
 *
 * Coverage rather than `book_appointment`'s exact-slot equality, because an
 * appointment that is not 30 minutes long can never equal a generated
 * service-less slot and so could never be moved at all. Sound because
 * `subtractInterval` in the engine drops every slot overlapping a blocker, so a
 * surviving slot is wholly before or wholly after it and a block strictly inside
 * a merged range is not representable.
 */
export function isWindowFree(
  slots: { startsAt: string; endsAt: string }[],
  startsAt: string,
  endsAt: string
): boolean {
  const startMs = Date.parse(startsAt)
  const endMs = Date.parse(endsAt)
  if (!(endMs > startMs)) return false
  return mergeFreeRanges(slots).some(
    (range) => range.startMs <= startMs && range.endMs >= endMs
  )
}

/**
 * Candidate windows of `durationMs` anchored on free slot starts: same UTC day
 * as the request first, ranked by distance from it, then later days ascending.
 *
 * Anchoring on slot starts keeps every offered alternative grid-aligned even
 * though the coverage check above accepts off-grid moves.
 */
export function rankAlternatives(
  days: DaySlots[],
  requestedStartMs: number,
  durationMs: number,
  limit = ALTERNATIVE_LIMIT,
  /**
   * The appointment's own current start. `excludeAppointmentId` stops the
   * appointment from blocking itself, which also makes the instant it already
   * occupies look free — so without this the agent offers the caller the time
   * they are already booked at, and accepting it comes back as
   * `already_at_requested_time`. Every offered option has to be a real move.
   */
  excludeStartMs?: number
): { startsAt: string; endsAt: string }[] {
  const requestedDate = utcDateOf(new Date(requestedStartMs).toISOString())
  const seen = new Set<number>()
  const candidates: { startsAt: string; endsAt: string; sameDay: boolean; startMs: number }[] = []

  for (const day of days) {
    for (const slot of day.slots) {
      const startMs = Date.parse(slot.startsAt)
      if (seen.has(startMs)) continue
      if (excludeStartMs !== undefined && startMs === excludeStartMs) continue
      const endsAt = new Date(startMs + durationMs).toISOString()
      if (!isWindowFree(day.slots, slot.startsAt, endsAt)) continue
      seen.add(startMs)
      candidates.push({
        startsAt: slot.startsAt,
        endsAt,
        sameDay: day.date === requestedDate,
        startMs,
      })
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.sameDay !== b.sameDay) return a.sameDay ? -1 : 1
      if (a.sameDay) {
        return Math.abs(a.startMs - requestedStartMs) - Math.abs(b.startMs - requestedStartMs)
      }
      return a.startMs - b.startMs
    })
    .slice(0, limit)
    .map(({ startsAt, endsAt }) => ({ startsAt, endsAt }))
}

type ResolveArgs = { clientEmail: string; startsAt: string; appointmentId?: string }

type ResolveResult =
  | { ok: true; row: AppointmentRow }
  /** A terminal tool result, returned to the model as-is. */
  | { ok: false; result: Record<string, unknown> }

/**
 * The identification rule in code. Shared by both mutating tools so neither can
 * drift from it.
 *
 * Nothing here ever queries by appointment id: the id only ever *narrows* a set
 * already scoped to this org and this email. A caller handing over someone
 * else's appointment id — in this org or another — gets
 * `appointment_not_found`, the same answer as a nonexistent id, with no
 * existence disclosure and no write.
 */
async function resolveAppointment(
  context: VoiceToolContext,
  args: ResolveArgs,
  now: Date
): Promise<ResolveResult> {
  let rows: AppointmentRow[]
  try {
    rows = await findClientAppointmentsByEmailServiceRole(
      context.organizationId,
      args.clientEmail,
      { sinceIso: isoMinusDays(now, LOOKBACK_DAYS), limit: LOOKUP_ROW_LIMIT }
    )
  } catch (error) {
    console.error('[manage-booking-tools] appointment lookup failed:', error)
    return { ok: false, result: { error: 'lookup_failed' } }
  }

  if (rows.length === 0) {
    return { ok: false, result: { error: 'appointment_not_found' } }
  }

  // Compared as instants because the model sends "…:00Z" while Postgres returns
  // "…:00+00:00".
  const statedMs = Date.parse(args.startsAt)
  const instantMatches = rows.filter((row) => Date.parse(row.starts_at) === statedMs)
  // Narrowed to rows a mutation could actually land on, using the same filter
  // `find_appointment` applies. An exact instant match is deliberately *not*
  // filtered — that is what produces `appointment_already_cancelled` and
  // `appointment_in_past` for an appointment the caller named precisely. But a
  // day-wide candidate list is read back to the caller as live choices, and
  // picking a cancelled or past one dead-ends on a final error the agent walked
  // them into.
  const dayCandidates = rows.filter(
    (row) =>
      utcDateOf(row.starts_at) === utcDateOf(args.startsAt) &&
      row.status !== 'cancelled' &&
      Date.parse(row.starts_at) > now.getTime()
  )

  let candidates: AppointmentRow[]
  if (instantMatches.length > 0) {
    candidates = instantMatches
  } else if (isDateOnlyIntent(args.startsAt)) {
    if (dayCandidates.length === 0) {
      return { ok: false, result: { error: 'appointment_not_found' } }
    }
    candidates = dayCandidates
  } else if (dayCandidates.length > 0) {
    // The caller stated a specific time and nothing is booked at it. Never
    // widen to the day here: that is how "cancel my 3pm" ends up cancelling a
    // 2pm appointment and confirming a time the caller never asked for, after
    // the write. Read the real times back instead.
    return {
      ok: false,
      result: { error: 'confirm_appointment', appointments: describeMany(dayCandidates) },
    }
  } else {
    return { ok: false, result: { error: 'appointment_not_found' } }
  }

  if (args.appointmentId) {
    const narrowed = candidates.filter((row) => row.id === args.appointmentId)
    if (narrowed.length === 0) {
      // The id and the stated time disagree, or the id is not the caller's. The
      // answer is identical either way, so nothing is disclosed.
      return { ok: false, result: { error: 'appointment_not_found' } }
    }
    candidates = narrowed
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      result: { error: 'multiple_matches', appointments: describeMany(candidates) },
    }
  }

  const row = candidates[0]
  if (row.status === 'cancelled') {
    return {
      ok: false,
      result: { error: 'appointment_already_cancelled', summary: describeAppointment(row) },
    }
  }
  if (Date.parse(row.starts_at) < now.getTime()) {
    return {
      ok: false,
      result: { error: 'appointment_in_past', summary: describeAppointment(row) },
    }
  }

  return { ok: true, row }
}

/** Shared tail of every mutating tool's description: what to do with each non-success branch. */
const SHARED_FAILURE_GUIDANCE =
  'If the result is `confirm_appointment`, the time you passed is not when any of the caller\'s appointments on that date starts — read the times in `appointments` back to the caller and retry with the one they confirm. If the result is `multiple_matches`, read the candidates back and retry with both the chosen appointment\'s `startsAt` and its `appointmentId`. If the result is `appointment_not_found`, re-confirm the caller\'s email address letter-by-letter and the appointment time; do not guess an `appointmentId`. If the result is `appointment_changed`, the appointment was moved or cancelled by someone else while you were talking and nothing was written — tell the caller it just changed, look it up again, and confirm the new time with them before retrying. `appointment_already_cancelled` and `appointment_in_past` are final — tell the caller and do not retry.'

function buildFindAppointment(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'find_appointment',
    description:
      "Look up the caller's existing upcoming appointments by their email address. Call this before cancelling or moving anything, read the results back to the caller, and have them confirm which appointment they mean. Ask the caller to spell their email letter-by-letter and read it back before calling. A `found: false` result with `hadRecentCancelledOrPast: true` means the caller has no upcoming appointment but did have a recent one that was cancelled or has already happened — say that rather than \"nothing booked\". `appointments` is capped at five, soonest first; if `totalUpcoming` is greater than the number of entries in `appointments`, say the caller has more and ask for the date of the one they mean.",
    parameters: findVoiceAppointmentSchema,
    execute: async (args) => {
      const now = new Date()
      try {
        const rows = await findClientAppointmentsByEmailServiceRole(
          context.organizationId,
          args.clientEmail,
          { sinceIso: isoMinusDays(now, LOOKBACK_DAYS), limit: LOOKUP_ROW_LIMIT }
        )
        const upcoming = rows.filter(
          (row) => row.status !== 'cancelled' && Date.parse(row.starts_at) > now.getTime()
        )
        if (upcoming.length === 0) {
          return { found: false, hadRecentCancelledOrPast: rows.length > 0 }
        }
        return {
          found: true,
          totalUpcoming: upcoming.length,
          appointments: describeMany(upcoming),
        }
      } catch (error) {
        console.error('[manage-booking-tools] find_appointment failed:', error)
        return { error: 'lookup_failed' }
      }
    },
  })
}

function buildCancelAppointment(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'cancel_appointment',
    description:
      "Cancel one of the caller's existing appointments. Requires their email address and the appointment's current start time as a full ISO 8601 datetime with offset — get it from `find_appointment` or from the caller stating it, and pass the `appointmentId` from `find_appointment` as well when you have it. Confirm with the caller which appointment is being cancelled before calling. Returns the title and original time of the appointment that was cancelled so you can confirm it on the call. " +
      SHARED_FAILURE_GUIDANCE,
    parameters: cancelVoiceAppointmentSchema,
    execute: async (args) => {
      const now = new Date()
      try {
        const resolved = await resolveAppointment(context, args, now)
        if (!resolved.ok) return resolved.result
        const { row } = resolved

        // The raw argument is fine here: `assertAppointmentOwnedByEmail`
        // already compares `.trim().toLowerCase()` on both sides.
        const result = await cancelAppointmentByEmailServiceRole(
          context.organizationId,
          row.id,
          args.clientEmail,
          // Pins the write to the start time the caller confirmed, so an
          // appointment that moved or was cancelled in between is not clobbered
          // on the strength of a stale read.
          { startsAt: row.starts_at }
        )
        if ('error' in result) {
          if (result.code === 'not_found') return { error: 'appointment_not_found' }
          if (result.code === 'conflict') {
            return { error: 'appointment_changed', summary: describeAppointment(row) }
          }
          console.error(
            `[manage-booking-tools] cancel failed for appointment ${row.id}: ${result.error}`
          )
          return { error: 'cancel_failed' }
        }

        return {
          success: true,
          appointmentId: row.id,
          title: row.title,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          summary: describeAppointment(row),
        }
      } catch (error) {
        console.error('[manage-booking-tools] cancel_appointment failed:', error)
        return { error: 'cancel_failed' }
      }
    },
  })
}

function buildRescheduleAppointment(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'reschedule_appointment',
    description:
      "Move one of the caller's existing appointments to a new time. Requires their email address, the appointment's *current* start time (`startsAt`), and the new time (`newStartsAt`), both as full ISO 8601 datetimes with offset — resolve \"tomorrow at 2\" to an absolute datetime first. Pass the `appointmentId` from `find_appointment` too when you have it. The appointment keeps its current length; do not pass an end time. If the result is `slot_unavailable` with alternatives, offer those times to the caller and retry with one of them. If the result is `slot_unavailable` with `reason: 'no_availability_in_window'`, nothing is bookable in the three days from the requested date — the business may be closed then, or the date may be further out than it takes bookings for — so ask the caller for a different or nearer date instead of telling them the business is fully booked. `new_time_in_past` means the new time has already passed — ask for a future time. `already_at_requested_time` means the appointment is already at that time — confirm that to the caller instead of retrying. Never claim a move succeeded unless the result says `success`. " +
      SHARED_FAILURE_GUIDANCE,
    parameters: rescheduleVoiceAppointmentSchema,
    execute: async (args) => {
      const now = new Date()
      try {
        const resolved = await resolveAppointment(context, args, now)
        if (!resolved.ok) return resolved.result
        const { row } = resolved

        const durationMs = Date.parse(row.ends_at) - Date.parse(row.starts_at)
        if (!(durationMs > 0)) {
          console.error(
            `[manage-booking-tools] appointment ${row.id} has a non-positive duration; cannot derive a new window`
          )
          return { error: 'reschedule_failed' }
        }

        const newStartsAtMs = Date.parse(args.newStartsAt)
        if (newStartsAtMs <= now.getTime()) {
          return { error: 'new_time_in_past' }
        }
        if (newStartsAtMs === Date.parse(row.starts_at)) {
          return { error: 'already_at_requested_time', summary: describeAppointment(row) }
        }

        const newStartsAt = new Date(newStartsAtMs).toISOString()
        const newEndsAt = new Date(newStartsAtMs + durationMs).toISOString()
        const requestedDate = utcDateOf(newStartsAt)

        let days: DaySlots[]
        try {
          // One three-UTC-day call serves both the coverage check and the
          // alternatives, so a live call turn pays for one round trip.
          // Forward-only on purpose: the agent asks for a different date rather
          // than offering the caller a date earlier than the one they asked for.
          days = await getAvailableSlots(context.organizationId, {
            // The appointment's stored assignments, not blanks. These drive
            // generated slot duration, the staff-hours override, staff-scoped
            // time off, and whether conflicts are evaluated per staff member or
            // across the whole org — so passing nothing moves assigned
            // appointments into their own staff member's time off, lets other
            // staff's appointments block valid times, and rejects
            // longer-than-30-minute services at windows that are free.
            serviceId: row.service_id ?? '',
            staffId: row.staff_id,
            rangeStart: requestedDate,
            rangeEnd: utcDatePlus(requestedDate, RESCHEDULE_WINDOW_DAYS),
            excludeAppointmentId: row.id,
          })
        } catch (error) {
          console.error('[manage-booking-tools] availability check failed:', error)
          return { error: 'availability_check_failed' }
        }

        const unavailable = (alternatives: { startsAt: string; endsAt: string }[]) => ({
          error: 'slot_unavailable',
          requestedStartsAt: newStartsAt,
          alternatives: alternatives.map((alt) => ({
            ...alt,
            summary: describeTime(alt.startsAt),
          })),
          alternativesFound: alternatives.length > 0,
          reason: alternatives.length > 0 ? 'time_taken' : 'no_availability_in_window',
        })

        const requestedDaySlots = days.find((day) => day.date === requestedDate)?.slots ?? []
        if (!isWindowFree(requestedDaySlots, newStartsAt, newEndsAt)) {
          return unavailable(
            rankAlternatives(
              days,
              newStartsAtMs,
              durationMs,
              ALTERNATIVE_LIMIT,
              Date.parse(row.starts_at)
            )
          )
        }

        const result = await rescheduleAppointmentByEmailServiceRole(
          context.organizationId,
          row.id,
          args.clientEmail,
          newStartsAt,
          newEndsAt,
          // Pins the write to the start time the caller confirmed, so a
          // concurrent change loses instead of being silently overwritten.
          { startsAt: row.starts_at }
        )
        if ('error' in result) {
          if (result.code === 'not_found') return { error: 'appointment_not_found' }
          if (result.code === 'conflict') {
            return { error: 'appointment_changed', summary: describeAppointment(row) }
          }
          if (result.code === 'slot_taken') {
            // The destination filled between the availability read and the
            // atomic write. Re-offering the alternatives from the same read is
            // the useful answer, even though one of them may have gone too —
            // the write would reject it again rather than double-book.
            return unavailable(
              rankAlternatives(
                days,
                newStartsAtMs,
                durationMs,
                ALTERNATIVE_LIMIT,
                Date.parse(row.starts_at)
              ).filter((alt) => Date.parse(alt.startsAt) !== newStartsAtMs)
            )
          }
          console.error(
            `[manage-booking-tools] reschedule failed for appointment ${row.id}: ${result.error}`
          )
          return { error: 'reschedule_failed' }
        }

        return {
          success: true,
          appointmentId: row.id,
          title: row.title,
          previousStartsAt: row.starts_at,
          previousSummary: describeAppointment(row),
          startsAt: newStartsAt,
          endsAt: newEndsAt,
          summary: `${row.title} on ${describeTime(newStartsAt)}`,
        }
      } catch (error) {
        console.error('[manage-booking-tools] reschedule_appointment failed:', error)
        return { error: 'reschedule_failed' }
      }
    },
  })
}

/** Manage-booking capabilities, in the order the model sees them. */
export function buildManageBookingToolHandlers(context: VoiceToolContext): VoiceToolHandler[] {
  return [
    buildFindAppointment(context),
    buildCancelAppointment(context),
    buildRescheduleAppointment(context),
  ]
}
