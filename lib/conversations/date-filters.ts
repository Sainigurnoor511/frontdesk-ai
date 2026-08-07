/** Parses a YYYY-MM-DD date input as local midnight. */
export function parseFilterDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Returns the conversation's created_at as a local calendar date. */
export function getConversationLocalDate(createdAt: string): Date {
  const instant = new Date(createdAt)
  return new Date(instant.getFullYear(), instant.getMonth(), instant.getDate())
}

export function isOnOrAfterFilterDate(createdAt: string, dateAfter: string): boolean {
  return getConversationLocalDate(createdAt) >= parseFilterDateInput(dateAfter)
}

export function isOnOrBeforeFilterDate(createdAt: string, dateBefore: string): boolean {
  return getConversationLocalDate(createdAt) <= parseFilterDateInput(dateBefore)
}
