import { useMemo } from 'react'
import { householdBalance } from '../domain/balance'
import { useBalanceEntries, useMembers, useSettlements, useYearlyAdjustments } from './queries'
import { useMonthRatios } from './ratios'

/**
 * Total balance between me and my partner over the whole history.
 * `net` > 0: partner owes me. `estimated`: at least one open month uses an estimated ratio.
 */
export function useHouseholdBalance() {
  const { me, partner } = useMembers()
  const entries = useBalanceEntries()
  const settlements = useSettlements()
  const ratios = useMonthRatios()
  const adjustments = useYearlyAdjustments()

  return useMemo(() => {
    const loading = !me || !partner || !entries.data || !settlements.data || !adjustments.data || !ratios.ready
    if (loading) return { loading: true as const, net: 0, estimated: false }
    const months = new Set(entries.data.map((e) => e.date.slice(0, 7)))
    const estimated = [...months].some((m) => {
      const r = ratios.ratioFor(m)
      return !r.closed && r.estimated
    })
    // Yearly adjustments are stored as "B owes A"; convert to my point of view.
    const adjusted = adjustments.data.reduce(
      (s, a) => s + (a.profile_a_id === me.id ? a.adjustment_cents : -a.adjustment_cents),
      0,
    )
    const net =
      householdBalance(me.id, partner.id, entries.data, settlements.data, (m) => ratios.ratioFor(m).shareMe) + adjusted
    return { loading: false as const, net, estimated }
  }, [me, partner, entries.data, settlements.data, adjustments.data, ratios])
}
