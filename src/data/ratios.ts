import { useMemo } from 'react'
import { computeMonthRatio, type MonthRatio, type RatioMode } from '../domain/ratio'
import { useHousehold, useIncomes, useMembers, usePeriods, type Period } from './queries'

export interface MonthRatioInfo extends MonthRatio {
  mode: RatioMode
  closed: boolean
  period: Period | undefined
}

/** "YYYY-MM" ↔ first-day date used in the database. */
export const monthToDate = (month: string) => `${month}-01`
export const dateToMonth = (date: string) => date.slice(0, 7)

/**
 * Split ratio for any month, from "my" point of view.
 * Closed months use their snapshot; open months are computed live from the current settings and incomes.
 */
export function useMonthRatios() {
  const { data: household } = useHousehold()
  const { me, partner } = useMembers()
  const periods = usePeriods()
  const incomes = useIncomes()

  return useMemo(() => {
    const periodByMonth = new Map((periods.data ?? []).map((p) => [dateToMonth(p.month), p]))
    const incomeOf = new Map((incomes.data ?? []).map((i) => [`${i.profile_id}|${dateToMonth(i.month)}`, i.income_cents]))
    const mode = (household?.ratio_mode ?? 'equal') as RatioMode

    let fixedShareMe: number | null = null
    if (household?.fixed_ratio != null && household.fixed_ratio_profile_id && me) {
      fixedShareMe =
        household.fixed_ratio_profile_id === me.id ? household.fixed_ratio : 1 - household.fixed_ratio
    }

    function ratioFor(month: string): MonthRatioInfo {
      const period = periodByMonth.get(month)
      if (period && me) {
        const meIsA = period.profile_a_id === me.id
        return {
          mode: period.ratio_mode as RatioMode,
          closed: true,
          period,
          shareMe: meIsA ? Number(period.share_a) : 1 - Number(period.share_a),
          estimated: period.estimated,
          incomeMe: meIsA ? period.income_a_cents : period.income_b_cents,
          incomePartner: meIsA ? period.income_b_cents : period.income_a_cents,
        }
      }
      const computed = computeMonthRatio({
        mode,
        fixedShareMe,
        incomeMe: me ? (incomeOf.get(`${me.id}|${month}`) ?? null) : null,
        incomePartner: partner ? (incomeOf.get(`${partner.id}|${month}`) ?? null) : null,
        referenceMe: me?.reference_monthly_income_cents ?? 0,
        referencePartner: partner?.reference_monthly_income_cents ?? 0,
      })
      return { ...computed, mode, closed: false, period: undefined }
    }

    return {
      ready: !!household && !!me && periods.isSuccess && incomes.isSuccess,
      ratioFor,
      periodByMonth,
      incomeOf: (profileId: string, month: string) => incomeOf.get(`${profileId}|${month}`) ?? null,
    }
  }, [household, me, partner, periods.data, periods.isSuccess, incomes.data, incomes.isSuccess])
}
