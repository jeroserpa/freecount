// Balance rules — see docs/SPEC.md §3 and §5.
// Pure functions, no framework or database code.

export type EntryKind = 'expense' | 'refund'
export type SplitType = 'personal' | 'shared' | 'custom' | 'for_other'

export interface BalanceEntry {
  kind: EntryKind
  amount_cents: number
  payer_id: string // for a refund: who received the money
  split_type: SplitType
  payer_share_cents: number | null // custom only
}

export interface BalanceSettlement {
  from_id: string
  to_id: string
  amount_cents: number
}

/**
 * Part of the entry's amount borne by the person who did NOT pay (or receive) it.
 * `otherRatio` is the other person's share for "shared" entries (0.5 for 50/50).
 * Fractional cents are rounded down, so the leftover cent stays with the payer.
 */
export function otherShareCents(entry: BalanceEntry, otherRatio: number): number {
  switch (entry.split_type) {
    case 'personal':
      return 0
    case 'shared':
      // Epsilon guards against float artefacts (e.g. 100 * 0.29 = 28.999999999999996).
      return Math.floor(entry.amount_cents * otherRatio + 1e-6)
    case 'custom':
      return entry.amount_cents - (entry.payer_share_cents ?? entry.amount_cents)
    case 'for_other':
      return entry.amount_cents
  }
}

/**
 * What an entry actually costs `userId` (negative for refunds).
 * `userRatio` is the user's share of "shared" entries (0.5 for 50/50).
 */
export function userShareCents(entry: BalanceEntry, userId: string, userRatio = 0.5): number {
  const payerIsUser = entry.payer_id === userId
  let share: number
  if (entry.split_type === 'personal') {
    share = payerIsUser ? entry.amount_cents : 0
  } else {
    const other = otherShareCents(entry, payerIsUser ? 1 - userRatio : userRatio)
    share = payerIsUser ? entry.amount_cents - other : other
  }
  return entry.kind === 'refund' ? -share : share
}

/** Signed amount: expenses positive, refunds negative. */
export function signedAmount(entry: Pick<BalanceEntry, 'kind' | 'amount_cents'>): number {
  return entry.kind === 'refund' ? -entry.amount_cents : entry.amount_cents
}

/**
 * Net balance between two users A and B.
 * Positive result: B owes A that many cents. Negative: A owes B.
 *
 * `ratioA` is A's share of "shared" entries (0.5 = 50/50).
 */
export function netBalance(
  userA: string,
  userB: string,
  entries: BalanceEntry[],
  settlements: BalanceSettlement[],
  ratioA = 0.5,
): number {
  let bOwesA = 0

  for (const e of entries) {
    if (e.split_type === 'personal') continue
    const payerIsA = e.payer_id === userA
    if (!payerIsA && e.payer_id !== userB) continue
    const otherShare = otherShareCents(e, payerIsA ? 1 - ratioA : ratioA)
    // Expense: the other owes the payer their share.
    // Refund: the receiver holds money partly belonging to the other, so owes it back.
    const owedToPayer = e.kind === 'refund' ? -otherShare : otherShare
    bOwesA += payerIsA ? owedToPayer : -owedToPayer
  }

  for (const s of settlements) {
    // A transfer from X to Y reduces what X owes Y.
    if (s.from_id === userB && s.to_id === userA) bOwesA -= s.amount_cents
    else if (s.from_id === userA && s.to_id === userB) bOwesA += s.amount_cents
  }

  return bOwesA
}

export interface DatedBalanceEntry extends BalanceEntry {
  date: string // YYYY-MM-DD
}

/**
 * Net balance over the whole history, where each month's "shared" entries use that month's ratio.
 * Positive result: B owes A. `shareAForMonth` returns A's share for a "YYYY-MM" month.
 */
export function householdBalance(
  userA: string,
  userB: string,
  entries: DatedBalanceEntry[],
  settlements: BalanceSettlement[],
  shareAForMonth: (month: string) => number,
): number {
  const byMonth = new Map<string, DatedBalanceEntry[]>()
  for (const e of entries) {
    const month = e.date.slice(0, 7)
    const list = byMonth.get(month)
    if (list) list.push(e)
    else byMonth.set(month, [e])
  }
  let total = netBalance(userA, userB, [], settlements)
  for (const [month, list] of byMonth) {
    total += netBalance(userA, userB, list, [], shareAForMonth(month))
  }
  return total
}

export interface MonthSummary {
  /** Net shared spending (expenses minus refunds), excluding personal entries. */
  sharedTotal: number
  paidA: number
  paidB: number
  /** What each person should bear. */
  costA: number
  costB: number
  /** Positive: B owes A for this month alone. */
  net: number
}

export function monthSummary(userA: string, userB: string, entries: BalanceEntry[], shareA: number): MonthSummary {
  const s: MonthSummary = { sharedTotal: 0, paidA: 0, paidB: 0, costA: 0, costB: 0, net: 0 }
  for (const e of entries) {
    if (e.split_type === 'personal') continue
    if (e.payer_id !== userA && e.payer_id !== userB) continue
    const amount = signedAmount(e)
    s.sharedTotal += amount
    if (e.payer_id === userA) s.paidA += amount
    else s.paidB += amount
    s.costA += userShareCents(e, userA, shareA)
    s.costB += userShareCents(e, userB, 1 - shareA)
  }
  s.net = s.paidA - s.costA
  return s
}
