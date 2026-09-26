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
      return Math.floor(entry.amount_cents * otherRatio)
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
