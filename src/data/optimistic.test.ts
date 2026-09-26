import { describe, expect, it } from 'vitest'
import { applyToBalanceList, applyToRangeList, removeFromList, toCachedEntry } from './optimistic'
import type { Entry } from './queries'

const entry = (id: string, date: string, created_at = '2026-01-01T00:00:00Z', patch: Partial<Entry> = {}): Entry =>
  toCachedEntry({ id, date, created_at, amount_cents: 100, payer_id: 'me', ...patch }, undefined)

describe('optimistic cache helpers', () => {
  it('inserts into the matching month, sorted newest first', () => {
    const list = [entry('a', '2026-09-20'), entry('b', '2026-09-05')]
    const next = applyToRangeList(list, entry('c', '2026-09-10'), '2026-09-01', '2026-10-01')
    expect(next.map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('moves an entry out of a month when its date changes', () => {
    const list = [entry('a', '2026-09-20')]
    expect(applyToRangeList(list, entry('a', '2026-10-02'), '2026-09-01', '2026-10-01')).toEqual([])
  })

  it('replaces an edited entry', () => {
    const list = [entry('a', '2026-09-20')]
    const edited = { ...list[0], amount_cents: 999 }
    expect(applyToRangeList(list, edited, '2026-09-01', '2026-10-01')[0].amount_cents).toBe(999)
  })

  it('balance list keeps only non-personal entries', () => {
    const shared = entry('a', '2026-09-20')
    expect(applyToBalanceList([], shared)).toHaveLength(1)
    const nowPersonal = { ...shared, split_type: 'personal' as const }
    expect(applyToBalanceList(applyToBalanceList([], shared), nowPersonal)).toHaveLength(0)
  })

  it('removes by id', () => {
    expect(removeFromList([entry('a', '2026-09-20'), entry('b', '2026-09-21')], 'a').map((e) => e.id)).toEqual(['b'])
  })

  it('merges a partial payload over the previous version', () => {
    const prev = entry('a', '2026-09-20', undefined, { note: 'old', category_id: 'c1' })
    const merged = toCachedEntry({ id: 'a', note: 'new' }, prev)
    expect(merged).toMatchObject({ note: 'new', category_id: 'c1', date: '2026-09-20' })
  })
})
