import { Link } from 'react-router'
import { useCategories, usePendingRecurring, useTemplates, useUpdatePending } from '../../data/queries'
import { formatDay } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { CategoryBadge } from '../entries/EntryRow'

/** Recurring reminders waiting for the real amount. */
export function PendingCard() {
  const pending = usePendingRecurring()
  const templates = useTemplates()
  const { data: categories = [] } = useCategories()
  const update = useUpdatePending()

  const items = (pending.data ?? [])
    .map((p) => ({ p, t: templates.data?.find((t) => t.id === p.template_id) }))
    .filter((x) => x.t)
  if (items.length === 0) return null
  const catById = new Map(categories.map((c) => [c.id, c]))

  return (
    <section className="card mt-4 ring-2 ring-amber-400/60">
      <h2 className="mb-1 font-semibold">🔔 To confirm</h2>
      <div className="divide-y divide-stone-100 dark:divide-stone-800">
        {items.map(({ p, t }) => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <CategoryBadge category={catById.get(t!.category_id ?? '')} />
            <Link to={`/add?pending=${p.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">{t!.note || catById.get(t!.category_id ?? '')?.name || 'Recurring'}</p>
              <p className="muted truncate text-xs">
                Due {formatDay(p.due_date)} · last {formatCents(p.suggested_amount_cents)}
              </p>
            </Link>
            <button
              className="muted px-2 text-xs underline"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: p.id, status: 'skipped' })}
            >
              Skip
            </button>
            <Link to={`/add?pending=${p.id}`} className="btn-primary px-3 py-1.5 text-sm">
              Add
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
