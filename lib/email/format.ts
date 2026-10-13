/**
 * Date and time rendering for outbound email. Separate from `html.ts`, which is
 * escaping and markup — nobody looks for timezone formatting in a file named
 * after HTML, and this is the helper that exists to stop a UTC-rendering bug
 * being reintroduced.
 */

/**
 * Wall-clock `date`/`time` for an instant, rendered in an IANA timezone.
 *
 * Use this for anything read back out of Postgres. `timestamptz` columns come
 * back from PostgREST normalised to `+00:00`, so the offset-parsing
 * `formatInIsoOffset()` in `send-appointment-confirmation.ts` would render UTC
 * for them — a 2 PM `America/New_York` appointment would email as "6:00 PM".
 * That function is correct only for the LLM-produced datetime strings it is
 * given, which carry a real offset; the two are not interchangeable.
 *
 * Hand-rolled on `Intl.DateTimeFormat` because `date-fns-tz` is not a
 * dependency.
 *
 * An unparseable `iso` or an invalid `timeZone` returns the raw `iso` string
 * rather than throwing: a malformed time in an email beats a failed job.
 */
export function formatInTimeZone(
  iso: string,
  timeZone: string,
  pattern: 'date' | 'time'
): string {
  try {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(parsed)

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ''

    if (pattern === 'date') {
      return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')}`
    }

    return `${get('hour')}:${get('minute')} ${get('dayPeriod')}`
  } catch {
    return iso
  }
}
