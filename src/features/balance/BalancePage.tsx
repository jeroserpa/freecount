import { Link } from 'react-router'
import { PageHeader, Spinner } from '../../components/ui'
import { useHouseholdBalance } from '../../data/balance'
import { useBalanceEntries, useDeleteSettlement, useMembers, useSettlements } from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { monthSummary } from '../../domain/balance'
import { currentMonth, formatDay, formatMonth } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { formatShare } from '../../domain/ratio'
import { BalanceCard } from './BalanceCard'

export function BalancePage() {
  const { me, partner } = useMembers()
  const balance = useHouseholdBalance()
  const entries = useBalanceEntries()
  const settlements = useSettlements()
  const ratios = useMonthRatios()
  const deleteSettlement = useDeleteSettlement()

  if (!me) return <Spinner />
  if (!partner) {
    return (
      <>
        <PageHeader title="Balance" />
        <p className="muted">Your partner hasn’t joined yet. Share the invite code from the Home screen.</p>
      </>
    )
  }

  const byMonth = new Map<string, NonNullable<typeof entries.data>>()
  for (const e of entries.data ?? []) {
    const m = e.date.slice(0, 7)
    byMonth.set(m, [...(byMonth.get(m) ?? []), e])
  }
  const now = currentMonth()
  const months = [...new Set([...byMonth.keys(), now])].filter((m) => m <= now).sort().reverse()
  const future = [...byMonth.keys()].filter((m) => m > now).sort()
  const name = (id: string) => (id === me.id ? 'You' : partner.display_name)

  return (
    <>
      <PageHeader title="Balance" />
      <BalanceCard
        net={balance.net}
        loading={balance.loading}
        estimated={balance.estimated}
        partnerName={partner.display_name}
      />

      <h2 className="mb-2 mt-6 px-1 font-semibold">Months</h2>
      {!ratios.ready || entries.isLoading ? (
        <Spinner />
      ) : (
        <div className="card divide-y divide-slate-100 py-1 dark:divide-slate-800">
          {[...future.reverse(), ...months].map((m) => {
            const r = ratios.ratioFor(m)
            const s = monthSummary(me.id, partner.id, byMonth.get(m) ?? [], r.shareMe)
            return (
              <Link key={m} to={`/balance/${m}`} className="flex items-center gap-3 py-3">
                <span className="text-xl">{r.closed ? '🔒' : m > now ? '🗓️' : '📂'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatMonth(m)}</p>
                  <p className="muted truncate text-xs">
                    Shared {formatCents(s.sharedTotal)} · You {formatShare(r.shareMe)}
                    {r.estimated && !r.closed ? ' (est.)' : ''}
                  </p>
                </div>
                <MonthResult net={s.net} />
                <span className="muted">›</span>
              </Link>
            )
          })}
        </div>
      )}

      <h2 className="mb-2 mt-6 px-1 font-semibold">Transfers</h2>
      {(settlements.data ?? []).length === 0 ? (
        <p className="muted px-1 text-sm">No transfers recorded yet.</p>
      ) : (
        <div className="card divide-y divide-slate-100 py-1 dark:divide-slate-800">
          {(settlements.data ?? []).slice(0, 20).map((s) => (
            <button
              key={s.id}
              className="flex w-full items-center gap-3 py-2.5 text-left"
              onClick={() => {
                if (confirm('Delete this transfer?')) deleteSettlement.mutate(s.id)
              }}
            >
              <span className="text-xl">⇄</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {name(s.from_id)} → {name(s.to_id)}
                </p>
                <p className="muted truncate text-xs">
                  {formatDay(s.date)}
                  {s.note && ` · ${s.note}`}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{formatCents(s.amount_cents)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** Month result from my point of view: + partner owes me, − I owe partner. */
export function MonthResult({ net }: { net: number }) {
  if (net === 0) return <span className="muted text-sm">—</span>
  return (
    <span className={`text-sm font-semibold tabular-nums ${net > 0 ? 'text-brand-600' : 'text-orange-600'}`}>
      {net > 0 ? '+' : '−'}
      {formatCents(Math.abs(net))}
    </span>
  )
}
