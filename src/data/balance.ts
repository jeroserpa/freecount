import { useMemo } from 'react'
import { householdBalance } from '../domain/balance'
import { useBalanceEntries, useMembers, useSettlements } from './queries'
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

  return useMemo(() => {
    const loading = !me || !partner || !entries.data || !settlements.data || !ratios.ready
    if (loading) return { loading: true as const, net: 0, estimated: false }
    const months = new Set(entries.data.map((e) => e.date.slice(0, 7)))
    const estimated = [...months].some((m) => {
      const r = ratios.ratioFor(m)
      return !r.closed && r.estimated
    })
    const net = householdBalance(me.id, partner.id, entries.data, settlements.data, (m) => ratios.ratioFor(m).shareMe)
    return { loading: false as const, net, estimated }
  }, [me, partner, entries.data, settlements.data, ratios])
}
