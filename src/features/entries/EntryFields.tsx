import type { ReactNode } from 'react'
import { Segmented } from '../../components/ui'
import type { Category, Profile } from '../../data/queries'
import type { SplitType } from '../../domain/balance'
import { formatCents, parseEuros } from '../../domain/money'
import { customPayerShareCents, type EntryDraft } from './draft'

/**
 * Amount, category, payer, split, date and note — shared by the entry form and the recurring template form.
 */
export function EntryFields({
  draft,
  onChange,
  me,
  partner,
  categories,
  sharedHint,
  dateLabel = 'Date',
  autoFocus = false,
  extra,
}: {
  draft: EntryDraft
  onChange: (patch: Partial<EntryDraft>) => void
  me: Profile
  partner: Profile | null
  categories: Category[]
  /** Explanation shown under the split when "Shared" is selected. */
  sharedHint: string
  dateLabel?: string
  autoFocus?: boolean
  /** Rendered between the split and the date/note row. */
  extra?: ReactNode
}) {
  const amountCents = parseEuros(draft.amount)
  const payerIsMe = draft.payerId === me.id
  const payer = payerIsMe ? me : partner
  const other = payerIsMe ? partner : me
  const payerName = payerIsMe ? 'You' : (partner?.display_name ?? 'Partner')
  const otherName = payerIsMe ? (partner?.display_name ?? 'partner') : 'you'
  const visibleCategories = categories.filter((c) => !c.archived || c.id === draft.categoryId)
  const customShare = draft.split === 'custom' ? customPayerShareCents(draft) : null

  const splitOptions: { value: SplitType; label: string }[] = [
    { value: 'shared', label: 'Shared' },
    { value: 'custom', label: 'Custom' },
    ...(other ? [{ value: 'for_other' as const, label: `For ${otherName}` }] : []),
    ...(payerIsMe ? [{ value: 'personal' as const, label: '🔒 Mine' }] : []),
  ]

  return (
    <>
      <Segmented
        value={draft.kind}
        onChange={(kind) => onChange({ kind })}
        options={[
          { value: 'expense', label: '💸 Expense' },
          { value: 'refund', label: '↩️ Refund / money in' },
        ]}
      />

      <div className="flex items-baseline justify-center gap-1">
        <span className="text-3xl font-semibold text-stone-400">€</span>
        <input
          className="w-48 bg-transparent text-center text-5xl font-bold tabular-nums outline-none placeholder:text-stone-300 dark:placeholder:text-stone-700"
          inputMode="decimal"
          placeholder="0.00"
          autoFocus={autoFocus}
          value={draft.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          aria-label="Amount"
        />
      </div>

      <input
        id="note"
        className="input text-center"
        value={draft.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Name (optional), e.g. Supermarket"
        aria-label="Name"
        maxLength={80}
        enterKeyHint="done"
      />

      <div className="grid grid-cols-4 gap-2">
        {visibleCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange({ categoryId: c.id === draft.categoryId ? null : c.id })}
            className={`flex flex-col items-center gap-1 rounded-xl p-2 text-xs transition ${
              c.id === draft.categoryId
                ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-600/20'
                : 'bg-white ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10'
            }`}
          >
            <span className="text-2xl">{c.emoji}</span>
            <span className="w-full truncate">{c.name}</span>
          </button>
        ))}
      </div>

      {partner && (
        <div>
          <span className="label">{draft.kind === 'refund' ? 'Received by' : 'Paid by'}</span>
          <Segmented
            value={draft.payerId}
            onChange={(payerId) =>
              onChange(payerId !== me.id && draft.split === 'personal' ? { payerId, split: 'shared' } : { payerId })
            }
            options={[
              { value: me.id, label: `${me.emoji} You` },
              { value: partner.id, label: `${partner.emoji} ${partner.display_name}` },
            ]}
          />
        </div>
      )}

      <div>
        <span className="label">Split</span>
        <Segmented value={draft.split} onChange={(split) => onChange({ split })} options={splitOptions} />
        <p className="muted mt-1.5 text-xs">
          {draft.split === 'shared' && sharedHint}
          {draft.split === 'custom' && `Set how much of it ${payerIsMe ? 'you bear' : `${payerName} bears`}.`}
          {draft.split === 'for_other' && `100% for ${otherName}.`}
          {draft.split === 'personal' && 'Only you can see it. Not counted in the balance.'}
        </p>
        {draft.split === 'custom' && (
          <div className="mt-2 flex gap-2">
            <input
              className="input flex-1"
              inputMode="decimal"
              placeholder={`${payer?.display_name ?? ''} part in ${draft.shareMode === 'amount' ? '€' : '%'}`}
              value={draft.payerShare}
              onChange={(e) => onChange({ payerShare: e.target.value })}
            />
            <div className="w-28">
              <Segmented
                value={draft.shareMode}
                onChange={(shareMode) => onChange({ shareMode, payerShare: '' })}
                options={[
                  { value: 'amount', label: '€' },
                  { value: 'percent', label: '%' },
                ]}
              />
            </div>
          </div>
        )}
        {draft.split === 'custom' && amountCents != null && customShare != null && (
          <p className="muted mt-1 text-xs">
            {payerName}: {formatCents(customShare)} · {other?.id === me.id ? 'You' : (other?.display_name ?? 'Partner')}:{' '}
            {formatCents(Math.max(0, amountCents - customShare))}
          </p>
        )}
      </div>

      {extra}

      <div>
        <label className="label" htmlFor="date">{dateLabel}</label>
        <input
          id="date"
          type="date"
          className="input"
          value={draft.date}
          onChange={(e) => onChange({ date: e.target.value })}
          required
        />
      </div>
    </>
  )
}
