// Split ratio for "shared" entries — see docs/SPEC.md §5.
// A "share" is the part of shared spending a person bears (0..1). Shares of both people sum to 1.

export type RatioMode = 'equal' | 'income' | 'fixed'

export interface RatioInput {
  mode: RatioMode
  /** Share borne by "me" in fixed mode. */
  fixedShareMe: number | null
  /** Actual incomes entered for the month (null = not entered). */
  incomeMe: number | null
  incomePartner: number | null
  /** Reference monthly incomes used as fallback (0 = unknown). */
  referenceMe: number
  referencePartner: number
}

export interface MonthRatio {
  shareMe: number
  /** True when a fallback was used (reference income or 50/50 because incomes are unknown). */
  estimated: boolean
  /** Incomes the ratio was computed from (income mode only). */
  incomeMe: number | null
  incomePartner: number | null
}

/** Round shares to 8 decimals (the precision stored in the database). */
export function roundShare(share: number): number {
  return Math.round(share * 1e8) / 1e8
}

export function computeMonthRatio(input: RatioInput): MonthRatio {
  if (input.mode === 'equal') {
    return { shareMe: 0.5, estimated: false, incomeMe: null, incomePartner: null }
  }
  if (input.mode === 'fixed') {
    const s = input.fixedShareMe
    const valid = s != null && s >= 0 && s <= 1
    return { shareMe: valid ? roundShare(s) : 0.5, estimated: !valid, incomeMe: null, incomePartner: null }
  }

  // Income mode: actual income if entered, else reference income (> 0), else unknown.
  const me = input.incomeMe ?? (input.referenceMe > 0 ? input.referenceMe : null)
  const partner = input.incomePartner ?? (input.referencePartner > 0 ? input.referencePartner : null)
  const estimated = input.incomeMe == null || input.incomePartner == null
  if (me == null || partner == null || me + partner === 0) {
    return { shareMe: 0.5, estimated: true, incomeMe: me, incomePartner: partner }
  }
  return { shareMe: roundShare(me / (me + partner)), estimated, incomeMe: me, incomePartner: partner }
}

export function formatShare(share: number): string {
  const pct = share * 100
  return `${Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct) : pct.toFixed(1)}%`
}
