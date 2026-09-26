import { describe, expect, it } from 'vitest'
import { formatCompactCents, parseEuros } from './money'

describe('parseEuros', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['0.07', 7],
    ['1 234,56', 123456],
    ['€ 3', 300],
    ['12.', 1200],
  ])('%s → %i', (input, cents) => {
    expect(parseEuros(input)).toBe(cents)
  })

  it.each(['', 'abc', '1.234', '-5', '1,2,3'])('rejects %s', (input) => {
    expect(parseEuros(input)).toBeNull()
  })
})

describe('formatCompactCents', () => {
  it('compacts', () => {
    expect(formatCompactCents(95000)).toBe('€950')
    expect(formatCompactCents(120000)).toBe('€1.2k')
    expect(formatCompactCents(200000)).toBe('€2k')
    expect(formatCompactCents(1500000)).toBe('€15k')
  })
})
