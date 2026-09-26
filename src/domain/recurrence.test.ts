import { describe, expect, it } from 'vitest'
import {
  addMonthsClamped,
  describeSchedule,
  monthlyEquivalentCents,
  occurrence,
  occurrencesBetween,
  type Schedule,
} from './recurrence'

describe('addMonthsClamped', () => {
  it('clamps to month end like Postgres', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-05-31', 1)).toBe('2026-06-30')
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonthsClamped('2026-03-15', -3)).toBe('2025-12-15')
  })
})

describe('occurrence', () => {
  const rent: Schedule = { start_date: '2026-05-31', frequency: 'monthly', every: 1 }
  it('never drifts after a short month (matches the SQL test)', () => {
    expect([0, 1, 2, 3, 4].map((n) => occurrence(rent, n))).toEqual([
      '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
    ])
  })
  it('weekly and yearly', () => {
    expect(occurrence({ start_date: '2026-09-01', frequency: 'weekly', every: 2 }, 3)).toBe('2026-10-13')
    expect(occurrence({ start_date: '2028-02-29', frequency: 'yearly', every: 1 }, 1)).toBe('2029-02-28')
    expect(occurrence({ start_date: '2028-02-29', frequency: 'yearly', every: 1 }, 4)).toBe('2032-02-29')
  })
})

describe('occurrencesBetween', () => {
  it('lists dates in a range and respects end_date', () => {
    const s = { start_date: '2026-01-10', frequency: 'monthly' as const, every: 1, end_date: '2026-11-10' }
    expect(occurrencesBetween(s, '2026-09-01', '2027-01-01')).toEqual(['2026-09-10', '2026-10-10', '2026-11-10'])
  })
})

describe('describeSchedule', () => {
  it('reads naturally', () => {
    expect(describeSchedule({ start_date: '2026-09-01', frequency: 'monthly', every: 1 })).toBe('Monthly on the 1st')
    expect(describeSchedule({ start_date: '2026-09-30', frequency: 'monthly', every: 3 })).toBe(
      'Every 3 months on the 30th (or last day)',
    )
    expect(describeSchedule({ start_date: '2026-09-22', frequency: 'monthly', every: 1 })).toBe('Monthly on the 22nd')
    expect(describeSchedule({ start_date: '2026-09-28', frequency: 'weekly', every: 1 })).toBe('Every Monday')
    expect(describeSchedule({ start_date: '2026-03-15', frequency: 'yearly', every: 1 })).toBe('Yearly on 15 March')
  })
})

describe('monthlyEquivalentCents', () => {
  it('normalises to a monthly amount', () => {
    expect(monthlyEquivalentCents(1200, { frequency: 'yearly', every: 1 })).toBe(100)
    expect(monthlyEquivalentCents(1000, { frequency: 'monthly', every: 2 })).toBe(500)
    expect(monthlyEquivalentCents(1200, { frequency: 'weekly', every: 1 })).toBe(5200)
  })
})
