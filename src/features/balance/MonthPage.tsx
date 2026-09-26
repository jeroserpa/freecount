import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { ErrorNote, PageHeader, Spinner } from '../../components/ui'
import {
  useBalanceEntries,
  useClosePeriod,
  useDeleteIncome,
  useMembers,
  useReopenPeriod,
  useSaveIncome,
  type Profile,
} from '../../data/queries'
import { monthToDate, useMonthRatios, type MonthRatioInfo } from '../../data/ratios'
import { monthSummary } from '../../domain/balance'
import { currentMonth, formatMonth, isValidMonth, shiftMonth } from '../../domain/dates'
import { centsToInput, formatCents, parseEuros } from '../../domain/money'
import { formatShare } from '../../domain/ratio'
import { MonthResult } from './BalancePage'

const MODE_LABEL = { equal: '50/50', income: 'Income-based', fixed: 'Fixed ratio' }

export function MonthPage() {
  const { month } = useParams()
  const { me, partner } = useMembers()
  const entries = useBalanceEntries()
  const ratios = useMonthRatios()
  const close = useClosePeriod()
  const reopen = useReopenPeriod()

  if (!isValidMonth(month ?? null)) return <Navigate to="/balance" replace />
  const m = month!
  if (!me || !partner || !ratios.ready || !entries.data) return <Spinner />

  const r = ratios.ratioFor(m)
  const monthEntries = entries.data.filter((e) => e.date.startsWith(m))
  const s = monthSummary(me.id, partner.id, monthEntries, r.shareMe)
  const isFuture = m > currentMonth()

  function closeMonth() {
    const warning = r.estimated
      ? '\n\nSome incomes are missing: the estimated ratio will be used.'
      : ''
    if (!confirm(`Close ${formatMonth(m)} with ${formatShare(r.shareMe)} / ${formatShare(1 - r.shareMe)}?${warning}\n\nShared entries of this month will be locked.`)) return
    close.mutate({
      household_id: me!.household_id!,
      month: monthToDate(m),
      ratio_mode: r.mode,
      profile_a_id: me!.id,
      profile_b_id: partner!.id,
      share_a: r.shareMe,
      income_a_cents: r.incomeMe,
      income_b_cents: r.incomePartner,
      estimated: r.estimated,
    })
  }

  return (
    <>
      <PageHeader title={formatMonth(m)} back="/balance" />

      <div className="mb-4 flex items-center justify-between">
        <Link to={`/balance/${shiftMonth(m, -1)}`} replace className="btn-secondary px-3 py-1.5">‹</Link>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            r.closed
              ? 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
              : 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
          }`}
        >
          {r.closed ? `🔒 Closed ${new Date(r.period!.closed_at).toLocaleDateString('en-GB')}` : '📂 Open'}
        </span>
        <Link to={`/balance/${shiftMonth(m, 1)}`} replace className="btn-secondary px-3 py-1.5">›</Link>
      </div>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Split</h2>
          <span className="muted text-sm">{MODE_LABEL[r.mode]}</span>
        </div>
        <RatioBar shareMe={r.shareMe} partnerName={partner.display_name} />
        {r.mode === 'income' && (
          <div className="space-y-2">
            <IncomeRow key={`me-${m}-${r.closed}-${ratios.incomeOf(me.id, m)}`} month={m} person={me} label="Your income" ratio={r} isMe />
            <IncomeRow key={`p-${m}-${r.closed}-${ratios.incomeOf(partner.id, m)}`} month={m} person={partner} label={`${partner.display_name}’s income`} ratio={r} />
          </div>
        )}
        {r.estimated && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {r.mode === 'income'
              ? r.incomeMe == null || r.incomePartner == null
                ? 'Incomes are unknown for this month, so 50/50 is used. Enter incomes or set reference incomes in Settings.'
                : 'Estimated: a reference income is used for someone who hasn’t entered this month’s income.'
              : 'No fixed ratio is set, so 50/50 is used. Set it in Settings.'}
          </p>
        )}
        {!r.closed && r.mode !== 'income' && (
          <p className="muted text-xs">
            The split mode is set for the household in <Link to="/settings" className="underline">Settings</Link>.
          </p>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="mb-2 font-semibold">Summary</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="muted text-xs">
              <th className="pb-1 text-left font-medium"></th>
              <th className="pb-1 text-right font-medium">Paid</th>
              <th className="pb-1 text-right font-medium">Should bear</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr>
              <td className="py-1">{me.emoji} You</td>
              <td className="py-1 text-right">{formatCents(s.paidA)}</td>
              <td className="py-1 text-right">{formatCents(s.costA)}</td>
            </tr>
            <tr>
              <td className="py-1">{partner.emoji} {partner.display_name}</td>
              <td className="py-1 text-right">{formatCents(s.paidB)}</td>
              <td className="py-1 text-right">{formatCents(s.costB)}</td>
            </tr>
            <tr className="border-t border-stone-100 font-semibold dark:border-stone-800">
              <td className="pt-2">Shared total</td>
              <td className="pt-2 text-right">{formatCents(s.sharedTotal)}</td>
              <td className="pt-2 text-right">{formatCents(s.costA + s.costB)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 dark:bg-stone-800/60">
          <span className="text-sm">
            {s.net === 0
              ? 'This month is even.'
              : s.net > 0
                ? `${partner.display_name} owes you for this month`
                : `You owe ${partner.display_name} for this month`}
          </span>
          <MonthResult net={s.net} />
        </div>
        <Link to={`/ledger?month=${m}&scope=shared`} className="mt-3 block text-sm font-medium text-brand-600 dark:text-brand-400">
          See the {monthEntries.length} shared entries ›
        </Link>
      </section>

      <ErrorNote error={close.error ?? reopen.error} />
      <div className="mt-4">
        {r.closed ? (
          <button
            className="btn-secondary w-full"
            disabled={reopen.isPending}
            onClick={() => {
              if (confirm(`Reopen ${formatMonth(m)}? Its entries become editable and its ratio is recomputed.`)) {
                reopen.mutate({ household_id: me.household_id!, month: monthToDate(m) })
              }
            }}
          >
            Reopen month
          </button>
        ) : (
          <button className="btn-primary w-full" disabled={close.isPending || isFuture} onClick={closeMonth}>
            {isFuture ? 'Month not started yet' : 'Close month'}
          </button>
        )}
        <p className="muted mt-2 text-center text-xs">
          Closing locks this month’s shared entries and freezes its ratio. The balance carries over; record a transfer
          from the Balance tab to settle.
        </p>
      </div>
    </>
  )
}

function RatioBar({ shareMe, partnerName }: { shareMe: number; partnerName: string }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
        <div className="bg-brand-500" style={{ width: `${shareMe * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-sm">
        <span>You {formatShare(shareMe)}</span>
        <span>{partnerName} {formatShare(1 - shareMe)}</span>
      </div>
    </div>
  )
}

function IncomeRow({
  month,
  person,
  label,
  ratio,
  isMe = false,
}: {
  month: string
  person: Profile
  label: string
  ratio: MonthRatioInfo
  isMe?: boolean
}) {
  const ratios = useMonthRatios()
  const save = useSaveIncome()
  const remove = useDeleteIncome()
  const entered = ratios.incomeOf(person.id, month)
  const snapshot = isMe ? ratio.incomeMe : ratio.incomePartner
  const [value, setValue] = useState(entered != null ? centsToInput(entered) : '')

  if (ratio.closed) {
    return (
      <div className="flex justify-between text-sm">
        <span className="muted">{label}</span>
        <span className="tabular-nums">{snapshot != null ? formatCents(snapshot) : '—'}</span>
      </div>
    )
  }

  const cents = value.trim() === '' ? null : parseEuros(value)
  const dirty = cents !== entered && !(value.trim() !== '' && cents == null)
  const reference = person.reference_monthly_income_cents

  return (
    <div>
      <label className="label" htmlFor={`income-${person.id}`}>{label}</label>
      <div className="flex gap-2">
        <input
          id={`income-${person.id}`}
          className="input flex-1"
          inputMode="decimal"
          placeholder={reference > 0 ? `Reference: ${formatCents(reference)}` : 'Net income this month'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {dirty && (
          <button
            className="btn-primary"
            disabled={save.isPending || remove.isPending}
            onClick={() =>
              cents == null
                ? remove.mutate({ profile_id: person.id, month: monthToDate(month) })
                : save.mutate({
                    household_id: person.household_id!,
                    profile_id: person.id,
                    month: monthToDate(month),
                    income_cents: cents,
                  })
            }
          >
            Save
          </button>
        )}
      </div>
      <ErrorNote error={save.error ?? remove.error} />
    </div>
  )
}
