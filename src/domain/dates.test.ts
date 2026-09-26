import { describe, expect, it } from 'vitest'
import { formatDay, isValidMonth, monthRange, shiftMonth } from './dates'

describe('dates', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('computes month ranges', () => {
    expect(monthRange('2026-09')).toEqual(['2026-09-01', '2026-10-01'])
    expect(monthRange('2026-12')).toEqual(['2026-12-01', '2027-01-01'])
  })

  it('validates months', () => {
    expect(isValidMonth('2026-09')).toBe(true)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth(null)).toBe(false)
  })

  it('labels today and yesterday', () => {
    expect(formatDay('2026-09-26', '2026-09-26')).toBe('Today')
    expect(formatDay('2026-09-25', '2026-09-26')).toBe('Yesterday')
    expect(formatDay('2026-08-31', '2026-09-01')).toBe('Yesterday')
  })
})
