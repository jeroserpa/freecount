import { Link } from 'react-router'
import { useCategories, useMembers, useTemplates, type Template } from '../../data/queries'
import { formatDay } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { monthlyEquivalentCents } from '../../domain/recurrence'

/** Home: what's coming up from repeating expenses, with a way into the full list. */
export function RecurringCard() {
  const templates = useTemplates()
  const { data: categories = [] } = useCategories()
  const { me, partner } = useMembers()
  if (!templates.data || !me) return null

  const ended = (t: Template) => !!t.end_date && t.next_due > t.end_date
  const active = templates.data.filter((t) => !t.paused && !ended(t)).sort((a, b) => a.next_due.localeCompare(b.next_due))
  const catById = new Map(categories.map((c) => [c.id, c]))
  const monthly = active.filter((t) => t.kind === 'expense').reduce((s, t) => s + monthlyEquivalentCents(t.amount_cents, t), 0)

  if (active.length === 0) {
    return (
      <Link to="/recurring" className="card mt-4 flex items-center gap-3">
        <span className="text-2xl">🔁</span>
        <span className="flex-1">
          <span className="block font-semibold">Repeating expenses</span>
          <span className="muted block text-sm">Add rent, subscriptions or bills once; they come back by themselves.</span>
        </span>
        <span className="muted">›</span>
      </Link>
    )
  }

  return (
    <section className="card mt-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-semibold">🔁 Repeating</h2>
        <Link to="/recurring" className="text-sm font-medium text-brand-600 dark:text-brand-400">
          All {active.length} · edit ›
        </Link>
      </div>
      <p className="muted mb-1 text-xs">≈ {formatCents(monthly)} per month committed</p>
      <ul className="divide-y divide-stone-100 dark:divide-stone-800">
        {active.slice(0, 3).map((t) => {
          const cat = catById.get(t.category_id ?? '')
          return (
            <li key={t.id}>
              <Link to={`/recurring/${t.id}`} className="flex items-center gap-3 py-2">
                <span className="w-6 text-center text-lg">{cat?.emoji ?? '🔁'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {t.note || cat?.name || 'Recurring'}
                    {t.split_type === 'personal' && ' 🔒'}
                  </span>
                  <span className="muted block truncate text-xs">
                    {formatDay(t.next_due)} · {t.mode === 'auto' ? '⚡ automatic' : '✋ to confirm'}
                    {t.payer_id !== me.id && partner ? ` · ${partner.display_name}` : ''}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {t.mode === 'reminder' && '~'}
                  {formatCents(t.amount_cents)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
