import { Link } from 'react-router'
import type { Category, Entry, Profile } from '../../data/queries'
import { formatCents } from '../../domain/money'
import { splitLabel } from './labels'

export function CategoryBadge({ category }: { category: Category | undefined }) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
      style={{ backgroundColor: `${category?.color ?? '#64748b'}22` }}
    >
      {category?.emoji ?? '❔'}
    </span>
  )
}

export function EntryRow({
  entry,
  category,
  meId,
  partner,
}: {
  entry: Entry
  category: Category | undefined
  meId: string
  partner: Profile | null
}) {
  const payerName = entry.payer_id === meId ? 'You' : (partner?.display_name ?? 'Partner')
  const refund = entry.kind === 'refund'
  return (
    <Link to={`/entry/${entry.id}`} className="flex items-center gap-3 py-2.5">
      <CategoryBadge category={category} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.note || category?.name || 'Expense'}</p>
        <p className="muted truncate text-xs">
          {payerName} {refund ? 'received' : 'paid'} · {splitLabel(entry, meId, partner)}
          {entry.recurring_template_id && ' · 🔁'}
        </p>
      </div>
      <span className={`font-semibold tabular-nums ${refund ? 'text-brand-600' : ''}`}>
        {refund ? '+' : ''}
        {formatCents(entry.amount_cents)}
      </span>
    </Link>
  )
}
