import { Link } from 'react-router'
import { useHousehold, useMembers } from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { currentMonth, formatMonth, shiftMonth } from '../../domain/dates'

/** In income mode, remind me to enter my income for last month (if still open) or this month. */
export function IncomePrompt() {
  const { data: household } = useHousehold()
  const { me, partner } = useMembers()
  const ratios = useMonthRatios()
  if (!household || household.ratio_mode !== 'income' || !me || !partner || !ratios.ready) return null

  const now = currentMonth()
  const previous = shiftMonth(now, -1)
  const missing = (m: string) => !ratios.ratioFor(m).closed && ratios.incomeOf(me.id, m) == null
  const month = missing(previous) ? previous : missing(now) ? now : null
  if (!month) return null

  return (
    <Link to={`/balance/${month}`} className="card mt-4 flex items-center gap-3 ring-2 ring-brand-500/40">
      <span className="text-2xl">💶</span>
      <span className="flex-1">
        <span className="block font-semibold">Enter your income for {formatMonth(month)}</span>
        <span className="muted block text-sm">It sets how shared expenses are split that month.</span>
      </span>
      <span className="muted">›</span>
    </Link>
  )
}
