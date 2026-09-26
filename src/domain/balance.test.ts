import { describe, expect, it } from 'vitest'
import { netBalance, otherShareCents, userShareCents, type BalanceEntry } from './balance'

const A = 'me'
const B = 'her'

const e = (partial: Partial<BalanceEntry>): BalanceEntry => ({
  kind: 'expense',
  amount_cents: 10000,
  payer_id: A,
  split_type: 'shared',
  payer_share_cents: null,
  ...partial,
})

describe('otherShareCents', () => {
  it('splits shared entries by ratio, leftover cent stays with payer', () => {
    expect(otherShareCents(e({ amount_cents: 1001 }), 0.5)).toBe(500)
    expect(otherShareCents(e({ amount_cents: 10000 }), 0.42)).toBe(4200)
  })
  it('handles personal, custom and for_other', () => {
    expect(otherShareCents(e({ split_type: 'personal' }), 0.5)).toBe(0)
    expect(otherShareCents(e({ split_type: 'custom', payer_share_cents: 7000 }), 0.5)).toBe(3000)
    expect(otherShareCents(e({ split_type: 'for_other' }), 0.5)).toBe(10000)
  })
})

describe('userShareCents', () => {
  it('gives each person their part of shared entries', () => {
    const bill = e({ payer_id: B, amount_cents: 1001 })
    expect(userShareCents(bill, A)).toBe(500)
    expect(userShareCents(bill, B)).toBe(501)
  })
  it('personal entries cost only their owner', () => {
    const p = e({ split_type: 'personal', payer_id: A })
    expect(userShareCents(p, A)).toBe(10000)
    expect(userShareCents(p, B)).toBe(0)
  })
  it('refunds are negative', () => {
    expect(userShareCents(e({ kind: 'refund', payer_id: B, amount_cents: 6000 }), A)).toBe(-3000)
  })
  it('for_other costs only the other person', () => {
    const gift = e({ split_type: 'for_other', payer_id: A })
    expect(userShareCents(gift, A)).toBe(0)
    expect(userShareCents(gift, B)).toBe(10000)
  })
})

describe('netBalance', () => {
  it('is zero with nothing', () => {
    expect(netBalance(A, B, [], [])).toBe(0)
  })

  it('shared 50/50: other owes half', () => {
    expect(netBalance(A, B, [e({ payer_id: A })], [])).toBe(5000)
    expect(netBalance(A, B, [e({ payer_id: B })], [])).toBe(-5000)
  })

  it('ignores personal entries', () => {
    expect(netBalance(A, B, [e({ split_type: 'personal' })], [])).toBe(0)
  })

  it('custom and for_other', () => {
    expect(netBalance(A, B, [e({ split_type: 'custom', payer_share_cents: 7000 })], [])).toBe(3000)
    expect(netBalance(A, B, [e({ payer_id: B, split_type: 'for_other' })], [])).toBe(-10000)
  })

  it('applies an unequal ratio to shared entries', () => {
    // A bears 60% → B owes 40% of what A paid; A owes 60% of what B paid.
    expect(netBalance(A, B, [e({ payer_id: A })], [], 0.6)).toBe(4000)
    expect(netBalance(A, B, [e({ payer_id: B })], [], 0.6)).toBe(-6000)
  })

  // SPEC §3.2 example: she pays electricity €200, a €60 refund arrives.
  it('refund received by me increases what I owe', () => {
    const bill = e({ payer_id: B, amount_cents: 20000 })
    const refundToMe = e({ kind: 'refund', payer_id: A, amount_cents: 6000 })
    expect(netBalance(A, B, [bill], [])).toBe(-10000)
    expect(netBalance(A, B, [bill, refundToMe], [])).toBe(-13000)
  })

  it('refund received by her reduces what I owe', () => {
    const bill = e({ payer_id: B, amount_cents: 20000 })
    const refundToHer = e({ kind: 'refund', payer_id: B, amount_cents: 6000 })
    expect(netBalance(A, B, [bill, refundToHer], [])).toBe(-7000)
  })

  it('settlements move the balance toward zero', () => {
    const entries = [e({ payer_id: B, amount_cents: 20000 })] // I owe 100€
    expect(netBalance(A, B, entries, [{ from_id: A, to_id: B, amount_cents: 10000 }])).toBe(0)
    expect(netBalance(A, B, entries, [{ from_id: A, to_id: B, amount_cents: 4000 }])).toBe(-6000)
  })

  it('ignores entries from unknown payers', () => {
    expect(netBalance(A, B, [e({ payer_id: 'someone' })], [])).toBe(0)
  })
})
