import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { ErrorNote, PageHeader, Spinner } from '../../components/ui'
import {
  useBalanceEntries,
  useDeleteAdjustment,
  useMembers,
  useSaveAdjustment,
  useYearlyAdjustments,
  type Profile,
  type YearlyAdjustment,
} from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { yearlyAdjustment } from '../../domain/balance'
import { centsToInput, formatCents, parseEuros } from '../../domain/money'
import { formatShare, roundShare } from '../../domain/ratio'

export function YearPage() {
  const { year: yearParam } = useParams()
  const year = Number(yearParam)
  const { me, partner } = useMembers()
  const adjustments = useYearlyAdjustments()

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return <Navigate to="/balance" replace />
  if (!me || !adjustments.data) return <Spinner />
  if (!partner) return <Navigate to="/balance" replace />
  const existing = adjustments.data.find((a) => a.year === year)
  return <YearForm key={`${year}-${existing?.created_at ?? 'new'}`} year={year} me={me} partner={partner} existing={existing} />
}

function YearForm({
  year,
  me,
  partner,
  existing,
}: {
  year: number
  me: Profile
  partner: Profile
  existing: YearlyAdjustment | undefined
}) {
  const entries = useBalanceEntries()
  const ratios = useMonthRatios()
  const save = useSaveAdjustment()
  const remove = useDeleteAdjustment()

  const meIsA = existing ? existing.profile_a_id === me.id : true
  const [incomeMe, setIncomeMe] = useState(
    existing ? centsToInput(meIsA ? existing.income_a_cents : existing.income_b_cents) : '',
  )
  const [incomePartner, setIncomePartner] = useState(
    existing ? centsToInput(meIsA ? existing.income_b_cents : existing.income_a_cents) : '',
  )

  if (!entries.data || !ratios.ready) return <Spinner />

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const yearEntries = entries.data.filter((e) => e.date.startsWith(`${year}-`))
  const monthsWithEntries = [...new Set(yearEntries.map((e) => e.date.slice(0, 7)))]
  const openMonths = monthsWithEntries.filter((m) => !ratios.ratioFor(m).closed)
  const sumEntered = (id: string) => months.reduce((s, m) => s + (ratios.incomeOf(id, m) ?? 0), 0)

  const a = parseEuros(incomeMe)
  const b = parseEuros(incomePartner)
  const valid = a != null && b != null && a + b > 0
  const yearlyShareMe = valid ? roundShare(a / (a + b)) : null
  const adjustment =
    yearlyShareMe != null
      ? yearlyAdjustment(me.id, partner.id, yearEntries, (m) => ratios.ratioFor(m).shareMe, yearlyShareMe)
      : null
  const storedForMe = existing ? (meIsA ? existing.adjustment_cents : -existing.adjustment_cents) : null
  const changed = adjustment != null && (storedForMe !== adjustment || !existing)

  function apply() {
    if (adjustment == null || yearlyShareMe == null) return
    save.mutate({
      household_id: me.household_id!,
      year,
      profile_a_id: me.id,
      profile_b_id: partner.id,
      income_a_cents: a!,
      income_b_cents: b!,
      share_a: yearlyShareMe,
      adjustment_cents: adjustment,
    })
  }

  const describe = (cents: number) =>
    cents === 0
      ? 'no change'
      : cents > 0
        ? `${partner.display_name} owes you ${formatCents(cents)} more`
        : `you owe ${partner.display_name} ${formatCents(-cents)} more`

  return (
    <>
      <PageHeader title={`Yearly adjustment ${year}`} back="/balance" />
      <div className="mb-4 flex justify-between">
        <Link to={`/balance/year/${year - 1}`} replace className="btn-secondary px-3 py-1.5">‹ {year - 1}</Link>
        <Link to={`/balance/year/${year + 1}`} replace className="btn-secondary px-3 py-1.5">{year + 1} ›</Link>
      </div>

      <p className="muted mb-4 text-sm">
        Monthly incomes vary (bonuses, extra months…). Enter both <strong>net incomes for the whole year</strong>: the
        year’s shared expenses are re-split with that yearly ratio, and the difference with what the monthly ratios gave
        is added to the balance. Custom and “for the other” entries are not affected.
      </p>

      <section className="card space-y-3">
        <IncomeInput
          id="year-me"
          label="Your net income for the year"
          value={incomeMe}
          onChange={setIncomeMe}
          hint={sumEntered(me.id)}
        />
        <IncomeInput
          id="year-partner"
          label={`${partner.display_name}’s net income for the year`}
          value={incomePartner}
          onChange={setIncomePartner}
          hint={sumEntered(partner.id)}
        />
        {yearlyShareMe != null && (
          <p className="text-sm">
            Yearly ratio: <strong>you {formatShare(yearlyShareMe)}</strong> · {partner.display_name}{' '}
            {formatShare(1 - yearlyShareMe)}
          </p>
        )}
      </section>

      {openMonths.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {openMonths.length === 1
            ? `1 month of ${year} is still open, so its ratio may still change. Close it first`
            : `${openMonths.length} months of ${year} are still open, so their ratios may still change. Close them first`}{' '}
          for a final result (you can update the adjustment later).
        </p>
      )}

      <section className="card mt-4 space-y-2">
        <h2 className="font-semibold">Result</h2>
        <p className="muted text-sm">
          {yearEntries.length} shared entries in {monthsWithEntries.length} month
          {monthsWithEntries.length === 1 ? '' : 's'}.
        </p>
        {adjustment == null ? (
          <p className="muted text-sm">Enter both yearly incomes to compute the adjustment.</p>
        ) : (
          <p className="text-lg font-semibold">With the yearly ratio, {describe(adjustment)}.</p>
        )}
        {storedForMe != null && (
          <p className="muted text-sm">Currently applied: {describe(storedForMe)}.</p>
        )}
      </section>

      <ErrorNote error={save.error ?? remove.error} />
      <div className="mt-4 space-y-2">
        <button className="btn-primary w-full" disabled={!changed || save.isPending} onClick={apply}>
          {existing ? 'Update adjustment' : 'Apply adjustment'}
        </button>
        {existing && (
          <button
            className="btn-danger w-full"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`Remove the ${year} adjustment from the balance?`)) {
                remove.mutate({ household_id: me.household_id!, year })
              }
            }}
          >
            Remove adjustment
          </button>
        )}
      </div>
    </>
  )
}

function IncomeInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  hint: number
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 36000"
      />
      {hint > 0 && (
        <button type="button" className="muted mt-1 text-xs underline" onClick={() => onChange(centsToInput(hint))}>
          Sum of monthly incomes entered: {formatCents(hint)} (use it)
        </button>
      )}
    </div>
  )
}
