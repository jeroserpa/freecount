import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader, Segmented, Spinner } from '../../components/ui'
import { useCategories, useEntries, useMembers, useTemplates, type Category } from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import {
  categoryMonthlyAverages,
  categoryTotals,
  fixedVsVariable,
  monthOf,
  monthlyTotals,
  paidBy,
  recurringForecast,
  relativeChange,
  type Scope,
} from '../../domain/analytics'
import { currentMonth, formatMonth, monthRange, shiftMonth } from '../../domain/dates'
import { formatCents, formatCompactCents } from '../../domain/money'
import { formatShare } from '../../domain/ratio'
import { ColumnChart } from './ColumnChart'
import { downloadText, entriesToCsv } from './exportCsv'

const RANGES = { '3': 3, '6': 6, '12': 12 } as const
type RangeKey = keyof typeof RANGES

const shortMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
}

export function StatsPage() {
  const [params, setParams] = useSearchParams()
  const range = (params.get('range') as RangeKey | null) ?? '6'
  const scope = (params.get('scope') as Scope | null) ?? 'mine'
  const categoryFilter = params.get('category')
  const now = currentMonth()
  const selected = params.get('month') ?? now
  const months = Array.from({ length: RANGES[range] ?? 6 }, (_, i) => shiftMonth(now, i - (RANGES[range] ?? 6) + 1))
  const [from] = monthRange(months[0])
  const [, to] = monthRange(now)

  const entries = useEntries(from, to)
  const { data: categories = [] } = useCategories()
  const { me, partner } = useMembers()
  const ratios = useMonthRatios()
  const templates = useTemplates()
  const [showTable, setShowTable] = useState(false)

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  if (!me || !ratios.ready) return <Spinner />
  const shareFor = (m: string) => ratios.ratioFor(m).shareMe
  const catById = new Map(categories.map((c) => [c.id, c]))
  const all = entries.data ?? []
  const scoped = categoryFilter
    ? all.filter((e) => (categoryFilter === 'none' ? e.category_id == null : e.category_id === categoryFilter))
    : all

  const monthly = monthlyTotals(scoped, months, scope, me.id, shareFor)
  const sel = months.includes(selected) ? selected : now
  const selTotal = monthly.get(sel) ?? 0
  const before = months.filter((m) => m < sel)
  const avgBefore = before.length ? Math.round(before.reduce((s, m) => s + (monthly.get(m) ?? 0), 0) / before.length) : 0
  const change = relativeChange(selTotal, avgBefore)

  const selEntries = all.filter((e) => monthOf(e.date) === sel)
  const cats = [...categoryTotals(selEntries, scope, me.id, shareFor)].sort((a, b) => b[1] - a[1])
  const avgs = categoryMonthlyAverages(all, before, scope, me.id, shareFor)
  const maxCat = Math.max(1, ...cats.map(([, v]) => v))
  const fv = fixedVsVariable(selEntries, scope, me.id, shareFor)
  const paid = paidBy(selEntries, me.id)
  const personal = selEntries.filter((e) => e.split_type === 'personal').reduce((s, e) => s + (e.kind === 'refund' ? -e.amount_cents : e.amount_cents), 0)
  const filterCat = categoryFilter && categoryFilter !== 'none' ? catById.get(categoryFilter) : undefined
  const nextMonth = shiftMonth(now, 1)
  const [nextFrom, nextTo] = monthRange(nextMonth)
  const forecast = recurringForecast(
    (templates.data ?? []).filter(
      (t) => !categoryFilter || (categoryFilter === 'none' ? t.category_id == null : t.category_id === categoryFilter),
    ),
    nextFrom,
    nextTo,
    scope,
    me.id,
    shareFor,
  )

  return (
    <>
      <PageHeader title="Stats" />

      {/* One filter row scopes everything below. */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Segmented
          value={scope}
          onChange={(v) => update({ scope: v === 'mine' ? null : v })}
          options={[
            { value: 'mine', label: 'My costs' },
            { value: 'shared', label: 'Shared' },
          ]}
        />
        <Segmented
          value={range}
          onChange={(v) => update({ range: v === '6' ? null : v, month: null })}
          options={[
            { value: '3', label: '3M' },
            { value: '6', label: '6M' },
            { value: '12', label: '12M' },
          ]}
        />
      </div>
      <p className="muted -mt-2 mb-4 text-xs">
        {scope === 'mine'
          ? 'What things cost you: your share of shared expenses plus your personal ones.'
          : 'Household shared spending (full amounts, personal expenses excluded).'}
      </p>

      <div className={entries.isFetching && entries.data ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label={`${formatMonth(sel)}${filterCat ? ` · ${filterCat.emoji}` : ''}`}
            value={formatCents(selTotal)}
            delta={
              change == null
                ? before.length
                  ? 'No earlier data'
                  : undefined
                : `${change > 0 ? '▲' : change < 0 ? '▼' : '='} ${Math.abs(Math.round(change * 100))}% vs ${before.length}-month avg`
            }
            deltaTone={change == null ? 'neutral' : change > 0.05 ? 'bad' : change < -0.05 ? 'good' : 'neutral'}
          />
          <Tile
            label="Fixed (recurring)"
            value={formatCents(fv.fixed)}
            delta={fv.fixed + fv.variable > 0 ? `${Math.round((fv.fixed / (fv.fixed + fv.variable)) * 100)}% of the month` : undefined}
          />
          {scope === 'mine' ? (
            <Tile label="Personal" value={formatCents(personal)} delta="🔒 only you see this" />
          ) : (
            <Tile
              label="Paid by you"
              value={formatCents(paid.me)}
              delta={partner ? `${partner.display_name}: ${formatCents(paid.partner)}` : undefined}
            />
          )}
          <Tile
            label="Your share"
            value={partner ? formatShare(shareFor(sel)) : '—'}
            delta={partner ? `${ratios.ratioFor(sel).closed ? '🔒 closed' : ratios.ratioFor(sel).estimated ? 'estimate' : 'open month'}` : undefined}
          />
        </div>

        {forecast.count > 0 && (
          <div className="card mt-2 flex items-center gap-3 px-3 py-3">
            <span className="text-2xl">📅</span>
            <p className="flex-1 text-sm">
              <span className="font-semibold">{formatMonth(nextMonth)}</span>: {formatCents(forecast.total)} already
              committed by {forecast.count} recurring {forecast.count === 1 ? 'expense' : 'expenses'}
              <span className="muted"> (reminders use the last amount)</span>
            </p>
          </div>
        )}

        {/* Monthly trend */}
        <section className="card mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {filterCat ? `${filterCat.emoji} ${filterCat.name}` : categoryFilter === 'none' ? 'Uncategorised' : 'Spending'}{' '}
              per month
            </h2>
            <div className="flex items-center gap-3 text-sm">
              {categoryFilter && (
                <button className="font-medium text-brand-600 dark:text-brand-400" onClick={() => update({ category: null })}>
                  All ✕
                </button>
              )}
              <button className="muted underline" onClick={() => setShowTable((s) => !s)}>
                {showTable ? 'Chart' : 'Table'}
              </button>
            </div>
          </div>
          {entries.isLoading ? (
            <Spinner />
          ) : showTable ? (
            <table className="w-full text-sm">
              <tbody className="tabular-nums">
                {months.map((m) => (
                  <tr key={m} className={m === sel ? 'font-semibold' : ''}>
                    <td className="py-1">{formatMonth(m)}</td>
                    <td className="py-1 text-right">{formatCents(monthly.get(m) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ColumnChart
              ariaLabel="Spending per month"
              columns={months.map((m) => ({ key: m, label: shortMonth(m), title: formatMonth(m), value: monthly.get(m) ?? 0 }))}
              selectedKey={sel}
              onSelect={(m) => update({ month: m === now ? null : m })}
              format={formatCents}
              formatTick={formatCompactCents}
            />
          )}
          <p className="muted mt-2 text-xs">Tap a month to see its details below.</p>
        </section>

        {/* Categories for the selected month */}
        <section className="card mt-4">
          <h2 className="font-semibold">Categories · {formatMonth(sel)}</h2>
          <p className="muted mb-2 text-xs">
            {before.length ? `Compared with the ${before.length}-month average before it.` : 'No earlier months to compare with.'}{' '}
            Tap a category to see its trend.
          </p>
          {cats.length === 0 ? (
            <p className="muted py-6 text-center text-sm">No spending this month.</p>
          ) : (
            <ul className="space-y-3">
              {cats.map(([id, value]) => (
                <CategoryRow
                  key={id ?? 'none'}
                  category={id ? catById.get(id) : undefined}
                  value={value}
                  max={maxCat}
                  average={avgs.get(id) ?? 0}
                  hasHistory={before.length > 0}
                  showBudget={scope === 'shared'}
                  onSelect={() => update({ category: id ?? 'none' })}
                />
              ))}
            </ul>
          )}
        </section>

        {partner && scope === 'shared' && paid.me + paid.partner > 0 && (
          <section className="card mt-4">
            <h2 className="mb-3 font-semibold">Who paid · {formatMonth(sel)}</h2>
            <SplitBar
              a={{ label: 'You', value: Math.max(0, paid.me) }}
              b={{ label: partner.display_name, value: Math.max(0, paid.partner) }}
            />
          </section>
        )}

        {partner && (
          <section className="card mt-4">
            <h2 className="font-semibold">Your share of shared expenses</h2>
            <p className="muted mb-2 text-xs">Per month, from the split ratio (closed months use their snapshot).</p>
            <ColumnChart
              ariaLabel="Your share per month"
              height={130}
              columns={months.map((m) => ({ key: m, label: shortMonth(m), title: formatMonth(m), value: Math.round(shareFor(m) * 1000) / 10 }))}
              selectedKey={sel}
              onSelect={(m) => update({ month: m === now ? null : m })}
              format={(v) => `${v}%`}
            />
          </section>
        )}

        <button
          className="btn-secondary mt-4 w-full"
          disabled={!entries.data}
          onClick={() =>
            downloadText(
              `freecount-${months[0]}-to-${now}.csv`,
              entriesToCsv(all, { me, partner, categories, shareFor }),
            )
          }
        >
          ⬇ Export these {RANGES[range]} months (CSV)
        </button>
      </div>
    </>
  )
}

function Tile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
}: {
  label: string
  value: string
  delta?: string
  deltaTone?: 'good' | 'bad' | 'neutral'
}) {
  const tone = {
    good: 'text-green-700 dark:text-green-400',
    bad: 'text-orange-700 dark:text-orange-400',
    neutral: 'muted',
  }[deltaTone]
  return (
    <div className="card px-3 py-3">
      <p className="muted truncate text-xs">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
      {delta && <p className={`truncate text-xs ${tone}`}>{delta}</p>}
    </div>
  )
}

function CategoryRow({
  category,
  value,
  max,
  average,
  hasHistory,
  showBudget,
  onSelect,
}: {
  category: Category | undefined
  value: number
  max: number
  average: number
  hasHistory: boolean
  showBudget: boolean
  onSelect: () => void
}) {
  const budget = showBudget ? category?.monthly_budget_cents : null
  const change = relativeChange(value, average)
  const over = budget != null && budget > 0 && value > budget
  return (
    <li>
      <button className="w-full text-left" onClick={onSelect}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate">
            {category?.emoji ?? '❔'} {category?.name ?? 'Uncategorised'}
          </span>
          <span className="font-semibold tabular-nums">{formatCents(value)}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div
            className="h-full rounded-r-[4px]"
            style={{ width: `${Math.max(1, (Math.max(0, value) / max) * 100)}%`, background: 'var(--chart-accent)' }}
          />
        </div>
        <div className="muted mt-1 flex justify-between gap-2 text-xs">
          <span>
            {hasHistory
              ? change == null
                ? 'new this period'
                : `avg ${formatCents(average)} · ${change > 0 ? '+' : ''}${Math.round(change * 100)}%`
              : ''}
          </span>
          {budget != null && budget > 0 && (
            <span className={over ? 'font-medium text-[var(--status-critical)]' : ''}>
              {over ? `⚠ over budget by ${formatCents(value - budget)}` : `budget ${formatCents(budget)} · ${Math.round((value / budget) * 100)}%`}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

/** Two-part share bar with a legend (identity never relies on colour alone). */
function SplitBar({ a, b }: { a: { label: string; value: number }; b: { label: string; value: number } }) {
  const total = a.value + b.value || 1
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        <div style={{ width: `${(a.value / total) * 100}%`, background: 'var(--chart-accent)' }} />
        <div style={{ width: `${(b.value / total) * 100}%`, background: 'var(--chart-second)' }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-accent)' }} />
          {a.label} <span className="font-semibold">{formatCents(a.value)}</span>
          <span className="muted">({Math.round((a.value / total) * 100)}%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-second)' }} />
          {b.label} <span className="font-semibold">{formatCents(b.value)}</span>
        </span>
      </div>
    </div>
  )
}
