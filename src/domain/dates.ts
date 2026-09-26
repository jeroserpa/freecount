// Dates are plain local calendar days as ISO strings ("2026-09-26"); months as "2026-09".

const pad = (n: number) => String(n).padStart(2, '0')

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function currentMonth(now = new Date()): string {
  return todayISO(now).slice(0, 7)
}

/** Month "YYYY-MM" shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** [first day, first day of next month) for a "YYYY-MM" month. */
export function monthRange(month: string): [string, string] {
  return [`${month}-01`, `${shiftMonth(month, 1)}-01`]
}

export function isValidMonth(month: string | null): month is string {
  return !!month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function formatDay(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today'
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const yesterday = new Date(date)
  yesterday.setDate(date.getDate() + 1)
  if (todayISO(yesterday) === today) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
