import { describe, expect, it } from 'vitest'
import { computeMonthRatio, formatShare, type RatioInput } from './ratio'

const base: RatioInput = {
  mode: 'income',
  fixedShareMe: null,
  incomeMe: null,
  incomePartner: null,
  referenceMe: 0,
  referencePartner: 0,
}

describe('computeMonthRatio', () => {
  it('equal mode is always 50/50', () => {
    expect(computeMonthRatio({ ...base, mode: 'equal', incomeMe: 1 })).toMatchObject({ shareMe: 0.5, estimated: false })
  })

  it('fixed mode uses the fixed share', () => {
    expect(computeMonthRatio({ ...base, mode: 'fixed', fixedShareMe: 0.6 })).toMatchObject({ shareMe: 0.6, estimated: false })
    expect(computeMonthRatio({ ...base, mode: 'fixed', fixedShareMe: null })).toMatchObject({ shareMe: 0.5, estimated: true })
  })

  it('income mode uses actual incomes', () => {
    const r = computeMonthRatio({ ...base, incomeMe: 300000, incomePartner: 200000 })
    expect(r).toEqual({ shareMe: 0.6, estimated: false, incomeMe: 300000, incomePartner: 200000 })
  })

  it('falls back to reference incomes and marks estimated', () => {
    const r = computeMonthRatio({ ...base, incomeMe: 300000, referencePartner: 100000 })
    expect(r).toMatchObject({ shareMe: 0.75, estimated: true, incomePartner: 100000 })
  })

  it('is 50/50 estimated when an income is unknown', () => {
    expect(computeMonthRatio({ ...base, incomeMe: 300000 })).toMatchObject({ shareMe: 0.5, estimated: true })
    expect(computeMonthRatio({ ...base, incomeMe: 0, incomePartner: 0 })).toMatchObject({ shareMe: 0.5, estimated: true })
  })

  it('an actual income of 0 is valid', () => {
    expect(computeMonthRatio({ ...base, incomeMe: 0, incomePartner: 200000 })).toMatchObject({ shareMe: 0, estimated: false })
  })

  it('rounds to 8 decimals', () => {
    expect(computeMonthRatio({ ...base, incomeMe: 1, incomePartner: 2 }).shareMe).toBe(0.33333333)
  })
})

describe('formatShare', () => {
  it('formats percentages', () => {
    expect(formatShare(0.5)).toBe('50%')
    expect(formatShare(0.58333)).toBe('58.3%')
    expect(formatShare(1 / 3)).toBe('33.3%')
  })
})
