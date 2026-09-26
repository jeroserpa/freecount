import { useSearchParams } from 'react-router'
import { PageHeader, Segmented, Spinner } from '../../components/ui'
import {
  useCategories,
  useDeleteSettlement,
  useEntries,
  useMembers,
  useSettlements,
  type Entry,
  type Settlement,
} from '../../data/queries'
import { signedAmount, userShareCents } from '../../domain/balance'
import { currentMonth, formatDay, formatMonth, isValidMonth, monthRange, shiftMonth } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { EntryRow } from './EntryRow'

type Scope = 'all' | 'shared' | 'personal'

export function LedgerPage() {
  const [params, setParams] = useSearchParams()
  const monthParam = params.get('month')
  const month = isValidMonth(monthParam) ? monthParam : currentMonth()
  const scope = (params.get('scope') as Scope | null) ?? 'all'
  const categoryFilter = params.get('category')

  const [from, to] = monthRange(month)
  const entries = useEntries(from, to)
  const settlements = useSettlements(from, to)
  const { data: categories = [] } = useCategories()
  const { me, partner } = useMembers()
  const deleteSettlement = useDeleteSettlement()

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  if (!me) return <Spinner />
  const catById = new Map(categories.map((c) => [c.id, c]))

  const filtered = (entries.data ?? []).filter(
    (e) =>
      (scope === 'all' || (scope === 'personal' ? e.split_type === 'personal' : e.split_type !== 'personal')) &&
      (!categoryFilter || e.category_id === categoryFilter),
  )
  const total = filtered.reduce((s, e) => s + signedAmount(e), 0)
  const myCost = filtered.reduce((s, e) => s + userShareCents(e, me.id), 0)

  // Group entries (and settlements, when unfiltered) by day, newest first.
  type Item = { type: 'entry'; entry: Entry } | { type: 'settlement'; settlement: Settlement }
  const items: Item[] = filtered.map((entry) => ({ type: 'entry', entry }))
  if (scope !== 'personal' && !categoryFilter) {
    for (const settlement of settlements.data ?? []) items.push({ type: 'settlement', settlement })
  }
  const days = new Map<string, Item[]>()
  for (const item of items) {
    const day = item.type === 'entry' ? item.entry.date : item.settlement.date
    days.set(day, [...(days.get(day) ?? []), item])
  }
  const sortedDays = [...days.keys()].sort().reverse()
  const name = (id: string) => (id === me.id ? 'You' : (partner?.display_name ?? 'Partner'))

  return (
    <>
      <PageHeader title="Ledger" />

      <div className="mb-3 flex items-center justify-between">
        <button className="btn-secondary px-3 py-1.5" onClick={() => update({ month: shiftMonth(month, -1) })}>‹</button>
        <button className="font-semibold" onClick={() => update({ month: null })}>{formatMonth(month)}</button>
        <button className="btn-secondary px-3 py-1.5" onClick={() => update({ month: shiftMonth(month, 1) })}>›</button>
      </div>

      <Segmented
        value={scope}
        onChange={(v) => update({ scope: v === 'all' ? null : v })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'shared', label: 'Shared' },
          { value: 'personal', label: '🔒 Personal' },
        ]}
      />

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {categories
          .filter((c) => !c.archived || c.id === categoryFilter)
          .map((c) => (
            <button
              key={c.id}
              onClick={() => update({ category: c.id === categoryFilter ? null : c.id })}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${
                c.id === categoryFilter
                  ? 'bg-brand-600 text-white'
                  : 'bg-white ring-1 ring-slate-900/10 dark:bg-slate-900 dark:ring-white/10'
              }`}
            >
              {c.emoji} {c.name}
            </button>
          ))}
      </div>

      <div className="card mt-3 flex justify-around text-center">
        <div>
          <p className="text-lg font-semibold tabular-nums">{formatCents(total)}</p>
          <p className="muted text-xs">Total</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums">{formatCents(myCost)}</p>
          <p className="muted text-xs">Cost for you</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums">{filtered.length}</p>
          <p className="muted text-xs">Entries</p>
        </div>
      </div>

      {entries.isLoading ? (
        <Spinner />
      ) : sortedDays.length === 0 ? (
        <p className="muted py-10 text-center text-sm">Nothing here.</p>
      ) : (
        sortedDays.map((day) => (
          <section key={day} className="mt-4">
            <h3 className="muted mb-1 px-1 text-xs font-semibold uppercase tracking-wide">{formatDay(day)}</h3>
            <div className="card divide-y divide-slate-100 py-1 dark:divide-slate-800">
              {days.get(day)!.map((item) =>
                item.type === 'entry' ? (
                  <EntryRow
                    key={item.entry.id}
                    entry={item.entry}
                    category={catById.get(item.entry.category_id ?? '')}
                    meId={me.id}
                    partner={partner}
                  />
                ) : (
                  <button
                    key={item.settlement.id}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                    onClick={() => {
                      if (confirm('Delete this settlement?')) deleteSettlement.mutate(item.settlement.id)
                    }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl dark:bg-slate-800">
                      ⇄
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {name(item.settlement.from_id)} → {name(item.settlement.to_id)}
                      </p>
                      <p className="muted truncate text-xs">Settlement{item.settlement.note && ` · ${item.settlement.note}`}</p>
                    </div>
                    <span className="font-semibold tabular-nums text-slate-500">{formatCents(item.settlement.amount_cents)}</span>
                  </button>
                ),
              )}
            </div>
          </section>
        ))
      )}
    </>
  )
}
