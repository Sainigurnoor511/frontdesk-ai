export const CALENDAR_VIEWS = ['Week', 'Day', 'Month'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export function parseCalendarDate(value?: string): Date {
  if (!value) return new Date()
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export function parseCalendarView(value?: string): CalendarView {
  if (value === 'Day' || value === 'Month') return value
  return 'Week'
}

export function formatCalendarDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getWeekRange(anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor)
  start.setHours(0, 0, 0, 0)
  const dayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dayOffset)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

export function getRangeForView(
  anchor: Date,
  view: CalendarView
): { start: Date; end: Date } {
  if (view === 'Day') {
    const start = new Date(anchor)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }

  if (view === 'Month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    return { start, end }
  }

  return getWeekRange(anchor)
}

export function getWeekDates(anchor: Date): Date[] {
  const { start } = getWeekRange(anchor)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function getMonthGridDates(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = new Date(firstOfMonth)
  const dayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dayOffset)

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}
