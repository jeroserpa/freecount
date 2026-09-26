// Pure helpers to apply an entry change to cached query data before the server confirms it
// (so entries added offline show up immediately).
import type { Entry } from './queries'

type BalanceRow = Pick<Entry, 'kind' | 'amount_cents' | 'payer_id' | 'split_type' | 'payer_share_cents' | 'date'> & {
  id?: string
}

const byDateDesc = (a: Entry, b: Entry) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)

/** A month list (['entries', from, to]): replace or insert when the date is in range, drop otherwise. */
export function applyToRangeList(list: Entry[], entry: Entry, from: string, toExclusive: string): Entry[] {
  const without = list.filter((e) => e.id !== entry.id)
  if (entry.date < from || entry.date >= toExclusive) return without
  return [...without, entry].sort(byDateDesc)
}

/** The balance list (['entries', 'balance']) only holds non-personal entries. */
export function applyToBalanceList(list: BalanceRow[], entry: Entry): BalanceRow[] {
  const without = list.filter((e) => e.id !== entry.id)
  if (entry.split_type === 'personal') return without
  const { kind, amount_cents, payer_id, split_type, payer_share_cents, date, id } = entry
  return [...without, { id, kind, amount_cents, payer_id, split_type, payer_share_cents, date }]
}

export function removeFromList<T extends { id?: string }>(list: T[], id: string): T[] {
  return list.filter((e) => e.id !== id)
}

/** Build the full cached row from a save payload (and the previous version, if any). */
export function toCachedEntry(payload: Partial<Entry> & Pick<Entry, 'id'>, previous: Entry | undefined): Entry {
  const now = new Date().toISOString()
  return {
    kind: 'expense',
    amount_cents: 0,
    category_id: null,
    created_at: now,
    created_by: '',
    date: now.slice(0, 10),
    household_id: '',
    note: '',
    payer_id: '',
    payer_share_cents: null,
    recurring_template_id: null,
    split_type: 'shared',
    ...previous,
    ...payload,
    updated_at: now,
  } as Entry
}
