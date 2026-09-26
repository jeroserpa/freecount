import { Link } from 'react-router'
import { PageHeader, Spinner } from '../../components/ui'
import { useHouseholdBalance } from '../../data/balance'
import { useCategories, useEntries, useHousehold, useMembers } from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { signedAmount, userShareCents } from '../../domain/balance'
import { currentMonth, formatMonth, monthRange } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { BalanceCard } from '../balance/BalanceCard'
import { EntryRow } from '../entries/EntryRow'
import { PendingCard } from '../recurring/PendingCard'
import { InviteCard } from '../settings/InviteCard'

export function HomePage() {
  const { data: household } = useHousehold()
  const { me, partner } = useMembers()
  const month = currentMonth()
  const [from, to] = monthRange(month)
  const entries = useEntries(from, to)
  const balance = useHouseholdBalance()
  const ratios = useMonthRatios()
  const { data: categories = [] } = useCategories()

  if (!me) return <Spinner />
  const catById = new Map(categories.map((c) => [c.id, c]))
  const monthEntries = entries.data ?? []
  const shared = monthEntries.filter((e) => e.split_type !== 'personal')
  const sharedTotal = shared.reduce((s, e) => s + signedAmount(e), 0)
  const shareMe = ratios.ratioFor(month).shareMe
  const myShare = shared.reduce((s, e) => s + userShareCents(e, me.id, shareMe), 0)
  const myPersonal = monthEntries
    .filter((e) => e.split_type === 'personal')
    .reduce((s, e) => s + signedAmount(e), 0)

  return (
    <>
      <PageHeader
        title={household?.name ?? 'Freecount'}
        action={
          <Link to="/settings" className="rounded-full p-2 text-xl" aria-label="Settings">
            ⚙️
          </Link>
        }
      />

      {!partner && household && <InviteCard code={household.invite_code} />}

      {partner && (
        <BalanceCard
          loading={balance.loading}
          net={balance.net}
          estimated={balance.estimated}
          partnerName={partner.display_name}
        />
      )}

      <PendingCard />

      <section className="card mt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{formatMonth(month)}</h2>
          <Link to="/ledger" className="text-sm font-medium text-brand-600">Ledger ›</Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Shared spend" value={sharedTotal} />
          <Stat label="Your share" value={myShare} />
          <Stat label="Your personal" value={myPersonal} />
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="mb-1 font-semibold">Latest</h2>
        {entries.isLoading ? (
          <Spinner />
        ) : monthEntries.length === 0 ? (
          <p className="muted py-6 text-center text-sm">No expenses this month yet. Tap + to add one.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {monthEntries.slice(0, 8).map((e) => (
              <EntryRow key={e.id} entry={e} category={catById.get(e.category_id ?? '')} meId={me.id} partner={partner} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2 dark:bg-slate-800/60">
      <p className="text-base font-semibold tabular-nums">{formatCents(value)}</p>
      <p className="muted text-xs">{label}</p>
    </div>
  )
}
