import { describe, expect, it } from 'vitest'
import {
  householdBalance,
  monthSummary,
  netBalance,
  otherShareCents,
  userShareCents,
  type BalanceEntry,
  type DatedBalanceEntry,
} from './balance'

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
  it('is not fooled by float artefacts', () => {
    expect(otherShareCents(e({ amount_cents: 100 }), 0.29)).toBe(29)
    expect(otherShareCents(e({ amount_cents: 1000 }), 1 - 0.7)).toBe(300)
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

describe('householdBalance', () => {
  const d = (date: string, partial: Partial<BalanceEntry>): DatedBalanceEntry => ({ ...e(partial), date })

  it('applies each month its own ratio', () => {
    const entries = [
      d('2026-08-15', { payer_id: A, amount_cents: 10000 }), // August: A bears 60% → B owes 40€
      d('2026-09-02', { payer_id: A, amount_cents: 10000 }), // September: 50/50 → B owes 50€
    ]
    const shareA = (m: string) => (m === '2026-08' ? 0.6 : 0.5)
    expect(householdBalance(A, B, entries, [], shareA)).toBe(9000)
  })

  it('includes settlements once', () => {
    const entries = [d('2026-08-15', { payer_id: B, amount_cents: 10000 })]
    const settle = [{ from_id: A, to_id: B, amount_cents: 5000 }]
    expect(householdBalance(A, B, entries, settle, () => 0.5)).toBe(0)
  })

  it('matches netBalance with a constant ratio', () => {
    const entries = [
      d('2026-07-01', { payer_id: A, amount_cents: 1234 }),
      d('2026-08-01', { payer_id: B, amount_cents: 999, kind: 'refund' }),
      d('2026-09-01', { payer_id: B, amount_cents: 5000, split_type: 'custom', payer_share_cents: 1000 }),
    ]
    expect(householdBalance(A, B, entries, [], () => 0.37)).toBe(netBalance(A, B, entries, [], 0.37))
  })
})

describe('monthSummary', () => {
  it('computes paid, cost and net', () => {
    const entries = [
      e({ payer_id: B, amount_cents: 20000 }),
      e({ payer_id: A, amount_cents: 6000, kind: 'refund' }),
      e({ payer_id: A, amount_cents: 4550 }),
      e({ payer_id: A, amount_cents: 1500, split_type: 'personal' }),
    ]
    const s = monthSummary(A, B, entries, 0.5)
    expect(s.sharedTotal).toBe(18550)
    expect(s.paidA).toBe(-1450)
    expect(s.paidB).toBe(20000)
    expect(s.costA + s.costB).toBe(s.sharedTotal)
    expect(s.net).toBe(netBalance(A, B, entries, [], 0.5))
    expect(s.net).toBe(-10725)
  })

  it('uses the ratio for shared entries', () => {
    const s = monthSummary(A, B, [e({ payer_id: A, amount_cents: 10000 })], 0.6)
    expect(s).toMatchObject({ costA: 6000, costB: 4000, net: 4000 })
  })
})
