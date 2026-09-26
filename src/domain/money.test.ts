import { describe, expect, it } from 'vitest'
import { parseEuros } from './money'

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
