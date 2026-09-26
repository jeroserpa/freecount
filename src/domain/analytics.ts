// Aggregations for the Stats page. Pure functions over visible entries
// (shared entries + the viewer's own personal entries, as returned by RLS).
import { signedAmount, userShareCents, type BalanceEntry } from './balance'
import { occurrencesBetween, type Schedule } from './recurrence'

export interface AnalyticsEntry extends BalanceEntry {
  date: string
  category_id: string | null
  recurring_template_id: string | null
}

/**
 * - `mine`: what things actually cost me (my share of shared entries + my personal entries)
 * - `shared`: household shared spending (non-personal entries, full amount)
 */
export type Scope = 'mine' | 'shared'

export const monthOf = (date: string) => date.slice(0, 7)

export function entryValue(e: AnalyticsEntry, scope: Scope, meId: string, shareMe: number): number {
  if (scope === 'shared') return e.split_type === 'personal' ? 0 : signedAmount(e)
  return userShareCents(e, meId, shareMe)
}

type ShareFor = (month: string) => number

export function monthlyTotals(
  entries: AnalyticsEntry[],
  months: string[],
  scope: Scope,
  meId: string,
  shareFor: ShareFor,
): Map<string, number> {
  const totals = new Map(months.map((m) => [m, 0]))
  for (const e of entries) {
    const m = monthOf(e.date)
    if (!totals.has(m)) continue
    totals.set(m, totals.get(m)! + entryValue(e, scope, meId, shareFor(m)))
  }
  return totals
}

/** Totals per category for the given entries (category null = uncategorised). */
export function categoryTotals(
  entries: AnalyticsEntry[],
  scope: Scope,
  meId: string,
  shareFor: ShareFor,
): Map<string | null, number> {
  const totals = new Map<string | null, number>()
  for (const e of entries) {
    const v = entryValue(e, scope, meId, shareFor(monthOf(e.date)))
    if (v === 0) continue
    totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + v)
  }
  return totals
}

/** Average monthly total per category over `months` (months without spending count as 0). */
export function categoryMonthlyAverages(
  entries: AnalyticsEntry[],
  months: string[],
  scope: Scope,
  meId: string,
  shareFor: ShareFor,
): Map<string | null, number> {
  const set = new Set(months)
  const totals = categoryTotals(
    entries.filter((e) => set.has(monthOf(e.date))),
    scope,
    meId,
    shareFor,
  )
  const out = new Map<string | null, number>()
  if (months.length === 0) return out
  for (const [k, v] of totals) out.set(k, Math.round(v / months.length))
  return out
}

/** Recurring (fixed) vs one-off (variable) spending. */
export function fixedVsVariable(
  entries: AnalyticsEntry[],
  scope: Scope,
  meId: string,
  shareFor: ShareFor,
): { fixed: number; variable: number } {
  const r = { fixed: 0, variable: 0 }
  for (const e of entries) {
    const v = entryValue(e, scope, meId, shareFor(monthOf(e.date)))
    if (e.recurring_template_id) r.fixed += v
    else r.variable += v
  }
  return r
}

/** Who paid the shared spending (net of refunds they received). */
export function paidBy(entries: AnalyticsEntry[], meId: string): { me: number; partner: number } {
  const r = { me: 0, partner: 0 }
  for (const e of entries) {
    if (e.split_type === 'personal') continue
    if (e.payer_id === meId) r.me += signedAmount(e)
    else r.partner += signedAmount(e)
  }
  return r
}

/** Relative change, or null when there is no meaningful base. */
export function relativeChange(current: number, base: number): number | null {
  if (base <= 0) return null
  return (current - base) / base
}

/** "Nice" axis maximum and ticks for a column chart. */
export function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const ticks: number[] = []
  for (let v = 0; v < max + step; v += step) {
    ticks.push(Math.round(v))
    if (v >= max) break
  }
  return ticks
}

export interface ForecastTemplate extends BalanceEntry, Schedule {
  paused: boolean
  end_date: string | null
  occurrences: number
}

/** Committed spending from recurring templates in [from, toExclusive), for the given scope. */
export function recurringForecast(
  templates: ForecastTemplate[],
  from: string,
  toExclusive: string,
  scope: Scope,
  meId: string,
  shareFor: ShareFor,
): { total: number; count: number } {
  const r = { total: 0, count: 0 }
  for (const t of templates) {
    if (t.paused) continue
    // Only occurrences not generated yet (numbers >= occurrences).
    for (const date of occurrencesBetween(t, from, toExclusive, t.occurrences)) {
      const v = entryValue({ ...t, date, category_id: null, recurring_template_id: 'x' }, scope, meId, shareFor(monthOf(date)))
      r.total += v
      r.count += 1
    }
  }
  return r
}
