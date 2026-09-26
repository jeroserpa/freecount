import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { ErrorNote, PageHeader, Segmented, Spinner } from '../../components/ui'
import {
  useCategories,
  useDeleteEntry,
  useEntry,
  useMembers,
  useSaveEntry,
  type Category,
  type Entry,
  type Profile,
} from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import type { EntryKind, SplitType } from '../../domain/balance'
import { formatMonth, todayISO } from '../../domain/dates'
import { centsToInput, formatCents, parseEuros } from '../../domain/money'
import { formatShare } from '../../domain/ratio'

export function EntryFormPage() {
  const { id } = useParams()
  const existing = useEntry(id)
  const { me, partner } = useMembers()
  const { data: categories } = useCategories()

  if (!me || !categories || (id && existing.isLoading)) return <Spinner />
  if (id && !existing.data) {
    return (
      <>
        <PageHeader title="Entry" back="/ledger" />
        <ErrorNote error={existing.error ?? 'Entry not found'} />
      </>
    )
  }
  return <EntryForm key={id ?? 'new'} entry={existing.data} me={me} partner={partner} categories={categories} />
}

type ShareMode = 'percent' | 'amount'

function EntryForm({
  entry,
  me,
  partner,
  categories,
}: {
  entry: Entry | undefined
  me: Profile
  partner: Profile | null
  categories: Category[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const save = useSaveEntry()
  const remove = useDeleteEntry()
  const ratios = useMonthRatios()

  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'expense')
  const [amount, setAmount] = useState(entry ? centsToInput(entry.amount_cents) : '')
  const [categoryId, setCategoryId] = useState<string | null>(entry?.category_id ?? null)
  const [payerId, setPayerId] = useState(entry?.payer_id ?? me.id)
  const [split, setSplit] = useState<SplitType>(entry?.split_type ?? 'shared')
  const [shareMode, setShareMode] = useState<ShareMode>('amount')
  const [payerShare, setPayerShare] = useState(
    entry?.payer_share_cents != null ? centsToInput(entry.payer_share_cents) : '',
  )
  const [date, setDate] = useState(entry?.date ?? todayISO())
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const amountCents = parseEuros(amount)
  const payer = payerId === me.id ? me : partner
  const other = payerId === me.id ? partner : me
  const payerName = payerId === me.id ? 'You' : (partner?.display_name ?? 'Partner')
  const otherName = payerId === me.id ? (partner?.display_name ?? 'partner') : 'you'
  const visibleCategories = categories.filter((c) => !c.archived || c.id === categoryId)
  const monthRatio = ratios.ratioFor(date.slice(0, 7))
  // Shared entries of a closed month are locked (the database enforces it too).
  const originalLocked = !!entry && entry.split_type !== 'personal' && ratios.ratioFor(entry.date.slice(0, 7)).closed
  const locked = originalLocked || (split !== 'personal' && monthRatio.closed)

  function customPayerShareCents(): number | null {
    if (amountCents == null) return null
    if (shareMode === 'amount') return parseEuros(payerShare)
    const pct = Number(payerShare.replace(',', '.'))
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || payerShare.trim() === '') return null
    return Math.round((amountCents * pct) / 100)
  }

  function goBack() {
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!amountCents) return setError('Enter an amount')
    let payer_share_cents: number | null = null
    if (split === 'custom') {
      payer_share_cents = customPayerShareCents()
      if (payer_share_cents == null || payer_share_cents > amountCents) {
        return setError(`${payerName}'s part must be between 0 and ${formatCents(amountCents)}`)
      }
    }
    save.mutate(
      {
        id: entry?.id ?? crypto.randomUUID(),
        household_id: me.household_id!,
        kind,
        amount_cents: amountCents,
        category_id: categoryId,
        payer_id: payerId,
        split_type: split,
        payer_share_cents,
        date,
        note: note.trim(),
      },
      { onSuccess: goBack },
    )
  }

  const splitOptions: { value: SplitType; label: string }[] = [
    { value: 'shared', label: 'Shared' },
    { value: 'custom', label: 'Custom' },
    ...(other ? [{ value: 'for_other' as const, label: `For ${otherName}` }] : []),
    ...(payerId === me.id ? [{ value: 'personal' as const, label: '🔒 Mine' }] : []),
  ]

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={entry ? 'Edit' : kind === 'refund' ? 'New refund' : 'New expense'}
        back="/"
        action={
          <button className="btn-primary px-5 py-2" disabled={save.isPending || locked}>
            Save
          </button>
        }
      />

      <div className="space-y-5">
        {locked && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            🔒 {formatMonthShort(originalLocked ? entry!.date : date)} is closed. Reopen it from the Balance tab to change
            shared entries.
          </p>
        )}
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: '💸 Expense' },
            { value: 'refund', label: '↩️ Refund / money in' },
          ]}
        />

        <div className="flex items-baseline justify-center gap-1">
          <span className="text-3xl font-semibold text-slate-400">€</span>
          <input
            className="w-48 bg-transparent text-center text-5xl font-bold tabular-nums outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700"
            inputMode="decimal"
            placeholder="0.00"
            autoFocus={!entry}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
              className={`flex flex-col items-center gap-1 rounded-xl p-2 text-xs transition ${
                c.id === categoryId
                  ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-600/20'
                  : 'bg-white ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10'
              }`}
            >
              <span className="text-2xl">{c.emoji}</span>
              <span className="w-full truncate">{c.name}</span>
            </button>
          ))}
        </div>

        {partner && (
          <div>
            <span className="label">{kind === 'refund' ? 'Received by' : 'Paid by'}</span>
            <Segmented
              value={payerId}
              onChange={(v) => {
                setPayerId(v)
                if (v !== me.id && split === 'personal') setSplit('shared')
              }}
              options={[
                { value: me.id, label: `${me.emoji} You` },
                { value: partner.id, label: `${partner.emoji} ${partner.display_name}` },
              ]}
            />
          </div>
        )}

        <div>
          <span className="label">Split</span>
          <Segmented value={split} onChange={setSplit} options={splitOptions} />
          <p className="muted mt-1.5 text-xs">
            {split === 'shared' &&
              (partner
                ? `Split with this month’s ratio: you ${formatShare(monthRatio.shareMe)} · ${partner.display_name} ${formatShare(1 - monthRatio.shareMe)}${monthRatio.estimated && !monthRatio.closed ? ' (estimate, final when the month is closed)' : ''}.`
                : 'Split with the household ratio.')}
            {split === 'custom' && `Set how much of it ${payerName === 'You' ? 'you' : payerName} bear${payerName === 'You' ? '' : 's'}.`}
            {split === 'for_other' && `100% for ${otherName}.`}
            {split === 'personal' && 'Only you can see it. Not counted in the balance.'}
          </p>
          {split === 'custom' && (
            <div className="mt-2 flex gap-2">
              <input
                className="input flex-1"
                inputMode="decimal"
                placeholder={shareMode === 'amount' ? `${payer?.display_name ?? ''} part in €` : `${payer?.display_name ?? ''} part in %`}
                value={payerShare}
                onChange={(e) => setPayerShare(e.target.value)}
              />
              <div className="w-28">
                <Segmented
                  value={shareMode}
                  onChange={(m) => {
                    setShareMode(m)
                    setPayerShare('')
                  }}
                  options={[
                    { value: 'amount', label: '€' },
                    { value: 'percent', label: '%' },
                  ]}
                />
              </div>
            </div>
          )}
          {split === 'custom' && amountCents != null && customPayerShareCents() != null && (
            <p className="muted mt-1 text-xs">
              {payerName}: {formatCents(customPayerShareCents()!)} · {other?.id === me.id ? 'You' : (other?.display_name ?? 'Partner')}:{' '}
              {formatCents(Math.max(0, amountCents - customPayerShareCents()!))}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        {error && <ErrorNote error={error} />}
        <ErrorNote error={save.error ?? remove.error} />

        {entry && (
          <button
            type="button"
            className="btn-danger w-full"
            disabled={remove.isPending || originalLocked}
            onClick={() => {
              if (confirm('Delete this entry?')) remove.mutate(entry.id, { onSuccess: goBack })
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}

const formatMonthShort = (date: string) => formatMonth(date.slice(0, 7))
