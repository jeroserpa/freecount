import { useState } from 'react'
import { ErrorNote, Segmented } from '../../components/ui'
import { useUpdateHousehold, useUpdateProfile, type Household, type Profile } from '../../data/queries'
import { centsToInput, formatCents, parseEuros } from '../../domain/money'
import type { RatioMode } from '../../domain/ratio'

export function SplitCard({ household, me, partner }: { household: Household; me: Profile; partner: Profile | null }) {
  const updateHousehold = useUpdateHousehold()
  const mode = household.ratio_mode as RatioMode
  const fixedShareMe =
    household.fixed_ratio != null && household.fixed_ratio_profile_id
      ? household.fixed_ratio_profile_id === me.id
        ? household.fixed_ratio
        : 1 - household.fixed_ratio
      : null

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Split of shared expenses</h2>
        <p className="muted mt-1 text-sm">
          Applies to entries marked “Shared”. Changing it affects open months only; closed months keep their ratio.
        </p>
      </div>
      <Segmented
        value={mode}
        onChange={(ratio_mode) => updateHousehold.mutate({ id: household.id, ratio_mode })}
        options={[
          { value: 'equal', label: '50/50' },
          { value: 'income', label: 'By income' },
          { value: 'fixed', label: 'Fixed %' },
        ]}
      />
      {mode === 'income' && (
        <p className="muted text-sm">
          Each month, enter both net incomes on the month’s page (Balance tab). Until then, the reference incomes below
          are used as an estimate.
        </p>
      )}
      {mode === 'fixed' && (
        <FixedShare key={fixedShareMe ?? 'none'} household={household} me={me} partner={partner} fixedShareMe={fixedShareMe} />
      )}
      {mode !== 'equal' && (
        <div className="space-y-3">
          <ReferenceIncome key={me.reference_monthly_income_cents} me={me} />
          {partner && (
            <div className="flex justify-between text-sm">
              <span className="muted">{partner.display_name}’s reference income</span>
              <span className="tabular-nums">
                {partner.reference_monthly_income_cents > 0 ? formatCents(partner.reference_monthly_income_cents) : 'not set'}
              </span>
            </div>
          )}
        </div>
      )}
      <ErrorNote error={updateHousehold.error} />
    </section>
  )
}

function FixedShare({
  household,
  me,
  partner,
  fixedShareMe,
}: {
  household: Household
  me: Profile
  partner: Profile | null
  fixedShareMe: number | null
}) {
  const update = useUpdateHousehold()
  const [pct, setPct] = useState(fixedShareMe != null ? String(Math.round(fixedShareMe * 1000) / 10) : '')
  const value = Number(pct.replace(',', '.'))
  const valid = pct.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100
  const dirty = valid && (fixedShareMe == null || Math.abs(value / 100 - fixedShareMe) > 1e-9)

  return (
    <div>
      <label className="label" htmlFor="fixed-share">Your share (%)</label>
      <div className="flex items-center gap-2">
        <input
          id="fixed-share"
          className="input w-28"
          inputMode="decimal"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          placeholder="e.g. 60"
        />
        {valid && partner && (
          <span className="muted flex-1 text-sm">
            {partner.display_name}: {Math.round((100 - value) * 10) / 10}%
          </span>
        )}
        {dirty && (
          <button
            className="btn-primary"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ id: household.id, fixed_ratio: Math.round(value * 100) / 10000, fixed_ratio_profile_id: me.id })
            }
          >
            Save
          </button>
        )}
      </div>
      <ErrorNote error={update.error} />
    </div>
  )
}

function ReferenceIncome({ me }: { me: Profile }) {
  const update = useUpdateProfile()
  const current = me.reference_monthly_income_cents
  const [value, setValue] = useState(current > 0 ? centsToInput(current) : '')
  const cents = value.trim() === '' ? 0 : parseEuros(value)
  const dirty = cents != null && cents !== current

  return (
    <div>
      <label className="label" htmlFor="ref-income">Your reference monthly income</label>
      <div className="flex gap-2">
        <input
          id="ref-income"
          className="input flex-1"
          inputMode="decimal"
          placeholder="e.g. yearly net ÷ 12"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {dirty && (
          <button
            className="btn-primary"
            disabled={update.isPending}
            onClick={() => update.mutate({ reference_monthly_income_cents: cents })}
          >
            Save
          </button>
        )}
      </div>
      <p className="muted mt-1 text-xs">Used when a month’s income hasn’t been entered yet.</p>
      <ErrorNote error={update.error} />
    </div>
  )
}
