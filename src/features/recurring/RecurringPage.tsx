import { Link } from 'react-router'
import { PageHeader, Spinner } from '../../components/ui'
import { useCategories, useMembers, useTemplates, type Template } from '../../data/queries'
import { formatDay } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { describeSchedule, monthlyEquivalentCents } from '../../domain/recurrence'
import { CategoryBadge } from '../entries/EntryRow'

export function RecurringPage() {
  const templates = useTemplates()
  const { data: categories = [] } = useCategories()
  const { me, partner } = useMembers()

  if (!me || templates.isLoading) return <Spinner />
  const catById = new Map(categories.map((c) => [c.id, c]))
  const all = templates.data ?? []
  const ended = (t: Template) => !!t.end_date && t.next_due > t.end_date
  const active = all.filter((t) => !t.paused && !ended(t))
  const inactive = all.filter((t) => t.paused || ended(t))
  const monthly = active
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + monthlyEquivalentCents(t.amount_cents, t), 0)

  const row = (t: Template) => (
    <Link key={t.id} to={`/recurring/${t.id}`} className="flex items-center gap-3 py-2.5">
      <CategoryBadge category={catById.get(t.category_id ?? '')} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {t.note || catById.get(t.category_id ?? '')?.name || 'Recurring'}
          {t.split_type === 'personal' && ' 🔒'}
        </p>
        <p className="muted truncate text-xs">
          {describeSchedule(t)} · {t.mode === 'auto' ? '⚡ auto' : '🔔 reminder'}
          {t.payer_id !== me.id && partner ? ` · ${partner.display_name}` : ''}
        </p>
        <p className="muted truncate text-xs">
          {t.paused ? 'Paused' : ended(t) ? 'Ended' : `Next: ${formatDay(t.next_due)}`}
        </p>
      </div>
      <span className="font-semibold tabular-nums">
        {t.mode === 'reminder' && '~'}
        {formatCents(t.amount_cents)}
      </span>
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Recurring"
        back="/settings"
        action={
          <Link to="/recurring/new" className="btn-primary px-4 py-2">
            + New
          </Link>
        }
      />
      {all.length === 0 ? (
        <div className="card text-center">
          <p className="text-3xl">🔁</p>
          <p className="mt-2 font-medium">No recurring expenses yet</p>
          <p className="muted mt-1 text-sm">
            Add rent, subscriptions or bills once, and they’ll be added (or you’ll be reminded) automatically. You can
            also tick “Repeat” when adding an expense.
          </p>
        </div>
      ) : (
        <>
          <div className="card mb-4 flex items-baseline justify-between">
            <span className="muted text-sm">Committed per month (approx.)</span>
            <span className="text-lg font-semibold tabular-nums">{formatCents(monthly)}</span>
          </div>
          {active.length > 0 && (
            <div className="card divide-y divide-slate-100 py-1 dark:divide-slate-800">{active.map(row)}</div>
          )}
          {inactive.length > 0 && (
            <>
              <h2 className="muted mb-1 mt-5 px-1 text-xs font-semibold uppercase tracking-wide">Paused or ended</h2>
              <div className="card divide-y divide-slate-100 py-1 opacity-70 dark:divide-slate-800">
                {inactive.map(row)}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
