import { describe, expect, it } from 'vitest'
import {
  categoryMonthlyAverages,
  categoryTotals,
  fixedVsVariable,
  monthlyTotals,
  niceTicks,
  paidBy,
  recurringForecast,
  relativeChange,
  type AnalyticsEntry,
} from './analytics'
import { centsToCsv, csvCell, toCsv } from './csv'

const ME = 'me'
const HER = 'her'
const e = (p: Partial<AnalyticsEntry>): AnalyticsEntry => ({
  kind: 'expense',
  amount_cents: 1000,
  payer_id: ME,
  split_type: 'shared',
  payer_share_cents: null,
  date: '2026-09-10',
  category_id: 'food',
  recurring_template_id: null,
  ...p,
})
const half = () => 0.5

const entries = [
  e({ date: '2026-08-05', amount_cents: 4000 }), // shared food, Aug
  e({ date: '2026-09-01', amount_cents: 90000, category_id: 'rent', recurring_template_id: 't', payer_id: HER }),
  e({ date: '2026-09-10', amount_cents: 2000 }), // shared food
  e({ date: '2026-09-12', amount_cents: 1500, split_type: 'personal', category_id: 'fun' }),
  e({ date: '2026-09-20', amount_cents: 600, kind: 'refund', category_id: 'food' }),
]

describe('analytics', () => {
  it('monthly totals per scope', () => {
    const shared = monthlyTotals(entries, ['2026-08', '2026-09'], 'shared', ME, half)
    expect([...shared]).toEqual([['2026-08', 4000], ['2026-09', 91400]])
    const mine = monthlyTotals(entries, ['2026-08', '2026-09'], 'mine', ME, half)
    // Sep: rent 450 + food 10 + personal 15 − refund 3 = 472
    expect([...mine]).toEqual([['2026-08', 2000], ['2026-09', 47200]])
  })

  it('uses each month’s ratio', () => {
    const mine = monthlyTotals(entries, ['2026-08'], 'mine', ME, (m) => (m === '2026-08' ? 0.75 : 0.5))
    expect(mine.get('2026-08')).toBe(3000)
  })

  it('category totals net refunds and skip zero values', () => {
    const sep = entries.filter((x) => x.date.startsWith('2026-09'))
    expect(Object.fromEntries(categoryTotals(sep, 'shared', ME, half))).toEqual({ rent: 90000, food: 1400 })
    expect(Object.fromEntries(categoryTotals(sep, 'mine', ME, half))).toEqual({ rent: 45000, food: 700, fun: 1500 })
  })

  it('averages over all months, empty months count as zero', () => {
    const avg = categoryMonthlyAverages(entries, ['2026-07', '2026-08'], 'shared', ME, half)
    expect(Object.fromEntries(avg)).toEqual({ food: 2000 })
  })

  it('fixed vs variable', () => {
    const sep = entries.filter((x) => x.date.startsWith('2026-09'))
    expect(fixedVsVariable(sep, 'shared', ME, half)).toEqual({ fixed: 90000, variable: 1400 })
  })

  it('who paid', () => {
    expect(paidBy(entries, ME)).toEqual({ me: 5400, partner: 90000 })
  })

  it('relative change', () => {
    expect(relativeChange(150, 100)).toBe(0.5)
    expect(relativeChange(10, 0)).toBeNull()
  })

  it('nice ticks', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(91400)).toEqual([0, 50000, 100000])
    expect(niceTicks(120000)).toEqual([0, 50000, 100000, 150000])
    expect(niceTicks(4000)).toEqual([0, 2000, 4000])
  })
})

describe('recurringForecast', () => {
  const t = {
    kind: 'expense' as const, amount_cents: 90000, payer_id: HER, split_type: 'shared' as const, payer_share_cents: null,
    start_date: '2026-01-31', frequency: 'monthly' as const, every: 1, paused: false, end_date: null, occurrences: 9,
  }
  it('counts only future occurrences in the window', () => {
    // occurrence #9 = 2026-10-31 (October), already generated ones are skipped
    expect(recurringForecast([t], '2026-10-01', '2026-11-01', 'shared', ME, half)).toEqual({ total: 90000, count: 1 })
    expect(recurringForecast([t], '2026-10-01', '2026-11-01', 'mine', ME, half)).toEqual({ total: 45000, count: 1 })
    expect(recurringForecast([{ ...t, occurrences: 10 }], '2026-10-01', '2026-11-01', 'shared', ME, half).count).toBe(0)
    expect(recurringForecast([{ ...t, paused: true }], '2026-10-01', '2026-11-01', 'shared', ME, half).count).toBe(0)
  })
  it('weekly templates occur several times', () => {
    const w = { ...t, amount_cents: 1000, frequency: 'weekly' as const, start_date: '2026-10-01', occurrences: 0 }
    expect(recurringForecast([w], '2026-10-01', '2026-11-01', 'shared', ME, half)).toEqual({ total: 5000, count: 5 })
  })
})

describe('csv', () => {
  it('escapes cells', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('-12.50')).toBe('-12.50')
  })
  it('writes rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x y']])).toBe('a,b\r\n1,x y\r\n')
    expect(centsToCsv(-1250)).toBe('-12.50')
  })
})
