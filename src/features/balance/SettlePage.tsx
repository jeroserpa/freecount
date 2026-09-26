import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ErrorNote, PageHeader, Segmented, Spinner } from '../../components/ui'
import { useHouseholdBalance } from '../../data/balance'
import { useAddSettlement, useMembers, type Profile } from '../../data/queries'
import { todayISO } from '../../domain/dates'
import { centsToInput, formatCents, parseEuros } from '../../domain/money'

export function SettlePage() {
  const { me, partner } = useMembers()
  const balance = useHouseholdBalance()

  if (!me) return <Spinner />
  if (!partner) {
    return (
      <>
        <PageHeader title="Settle up" back="/balance" />
        <p className="muted">Your partner hasn’t joined yet.</p>
      </>
    )
  }
  if (balance.loading) return <Spinner />
  return <SettleForm key={balance.net} me={me} partner={partner} net={balance.net} />
}

function SettleForm({ me, partner, net }: { me: Profile; partner: Profile; net: number }) {
  const navigate = useNavigate()
  const add = useAddSettlement()
  // Default direction: the debtor pays the creditor.
  const [direction, setDirection] = useState<'me_to_partner' | 'partner_to_me'>(
    net > 0 ? 'partner_to_me' : 'me_to_partner',
  )
  const [amount, setAmount] = useState(net !== 0 ? centsToInput(Math.abs(net)) : '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuros(amount)
    if (!cents) return setError('Enter an amount')
    const [from_id, to_id] = direction === 'me_to_partner' ? [me.id, partner.id] : [partner.id, me.id]
    add.mutate(
      { household_id: me.household_id!, from_id, to_id, amount_cents: cents, date, note: note.trim() },
      { onSuccess: () => navigate('/balance') },
    )
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title="Settle up" back="/balance" />

      <div className="card mb-5 text-center">
        <p className="muted text-sm">Current balance</p>
        <p className="mt-1 text-xl font-bold">
          {net === 0
            ? 'All square 🎉'
            : net > 0
              ? `${partner.display_name} owes you ${formatCents(net)}`
              : `You owe ${partner.display_name} ${formatCents(-net)}`}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <span className="label">Transfer</span>
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'me_to_partner', label: `You → ${partner.display_name}` },
              { value: 'partner_to_me', label: `${partner.display_name} → You` },
            ]}
          />
        </div>
        <div>
          <label className="label" htmlFor="amount">Amount (€)</label>
          <input id="amount" className="input text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
        <ErrorNote error={add.error} />
        <button className="btn-primary w-full" disabled={add.isPending}>Record transfer</button>
        <p className="muted text-center text-xs">
          This only records the transfer — send the money with your bank as usual.
        </p>
      </div>
    </form>
  )
}
