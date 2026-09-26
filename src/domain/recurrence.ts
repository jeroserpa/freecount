// Recurring schedules — mirrors private.recurring_occurrence in the database.
// Occurrence n is always computed from the start date, and month/year steps clamp to the
// end of shorter months (Jan 31 → Feb 28 → Mar 31), exactly like Postgres interval arithmetic.

export type Frequency = 'weekly' | 'monthly' | 'yearly'

export interface Schedule {
  start_date: string
  frequency: Frequency
  every: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

function parse(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m - 1, d]
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parse(date)
  const t = new Date(y, m, d + days)
  return iso(t.getFullYear(), t.getMonth(), t.getDate())
}

export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = parse(date)
  const total = y * 12 + m + months
  const ty = Math.floor(total / 12)
  const tm = total - ty * 12
  return iso(ty, tm, Math.min(d, daysInMonth(ty, tm)))
}

export function occurrence(s: Schedule, n: number): string {
  switch (s.frequency) {
    case 'weekly':
      return addDays(s.start_date, n * s.every * 7)
    case 'monthly':
      return addMonthsClamped(s.start_date, n * s.every)
    case 'yearly':
      return addMonthsClamped(s.start_date, n * s.every * 12)
  }
}

/** Occurrence dates in [from, toExclusive), starting at occurrence number `fromN`. */
export function occurrencesBetween(
  s: Schedule & { end_date?: string | null },
  from: string,
  toExclusive: string,
  fromN = 0,
): string[] {
  const out: string[] = []
  for (let n = fromN; n < fromN + 1000; n++) {
    const d = occurrence(s, n)
    if (d >= toExclusive || (s.end_date && d > s.end_date)) break
    if (d >= from) out.push(d)
  }
  return out
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function describeSchedule(s: Schedule): string {
  const [y, m, d] = parse(s.start_date)
  const date = new Date(y, m, d)
  switch (s.frequency) {
    case 'weekly': {
      const day = date.toLocaleDateString('en-GB', { weekday: 'long' })
      return s.every === 1 ? `Every ${day}` : `Every ${s.every} weeks on ${day}`
    }
    case 'monthly': {
      const on = d >= 29 ? `the ${ordinal(d)} (or last day)` : `the ${ordinal(d)}`
      return s.every === 1 ? `Monthly on ${on}` : `Every ${s.every} months on ${on}`
    }
    case 'yearly': {
      const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
      return s.every === 1 ? `Yearly on ${day}` : `Every ${s.every} years on ${day}`
    }
  }
}

/** Rough monthly cost of a schedule, for forecasts (weekly ≈ 52/12 per month). */
export function monthlyEquivalentCents(amountCents: number, s: Pick<Schedule, 'frequency' | 'every'>): number {
  const perYear = s.frequency === 'weekly' ? 52 / s.every : s.frequency === 'monthly' ? 12 / s.every : 1 / s.every
  return Math.round((amountCents * perYear) / 12)
}
