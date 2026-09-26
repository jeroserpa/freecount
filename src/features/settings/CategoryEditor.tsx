import { useState } from 'react'
import { ErrorNote } from '../../components/ui'
import { useDeleteCategory, useSaveCategory, type Category } from '../../data/queries'
import { centsToInput, parseEuros } from '../../domain/money'

const QUICK_EMOJIS = [
  '🛒', '🏠', '💡', '🍽️', '🚆', '🎉', '🏥', '🧴', '🎁', '✈️', '↩️', '📦',
  '☕', '🍺', '🍕', '🚗', '⛽', '🅿️', '🐶', '👶', '👕', '💇', '📱', '💻',
  '📚', '🎬', '🎮', '🏋️', '💊', '🧾', '🏦', '🛠️', '🌱', '🎓', '🏖️', '❤️',
]
const COLORS = ['#16a34a', '#2563eb', '#eab308', '#ea580c', '#0891b2', '#db2777', '#dc2626', '#7c3aed', '#c026d3', '#0d9488', '#65a30d', '#64748b']

export function CategoryEditor({
  category,
  householdId,
  nextSortOrder = 0,
  onDone,
}: {
  category?: Category
  householdId: string
  nextSortOrder?: number
  onDone: () => void
}) {
  const save = useSaveCategory()
  const remove = useDeleteCategory()
  const [name, setName] = useState(category?.name ?? '')
  const [emoji, setEmoji] = useState(category?.emoji ?? '📦')
  const [color, setColor] = useState(category?.color ?? COLORS[0])
  const [budget, setBudget] = useState(
    category?.monthly_budget_cents != null ? centsToInput(category.monthly_budget_cents) : '',
  )
  const budgetCents = budget.trim() === '' ? null : parseEuros(budget)
  const budgetInvalid = budget.trim() !== '' && budgetCents == null

  function submit() {
    save.mutate(
      {
        ...(category ?? { household_id: householdId, sort_order: nextSortOrder }),
        name: name.trim(),
        emoji: emoji.trim() || '📦',
        color,
        monthly_budget_cents: budgetCents,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div className="my-2 space-y-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60">
      <div className="flex gap-2">
        <input
          className="input w-16 text-center text-xl"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label="Emoji (type any emoji)"
        />
        <input
          className="input flex-1"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-9 gap-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className={`rounded-lg p-1 text-xl ${e === emoji ? 'bg-brand-100 dark:bg-brand-600/30' : ''}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-7 w-7 rounded-full ${c === color ? 'ring-2 ring-stone-900 ring-offset-2 dark:ring-white dark:ring-offset-stone-800' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div>
        <label className="label" htmlFor="budget">Monthly budget for shared spending (optional)</label>
        <input
          id="budget"
          className="input"
          inputMode="decimal"
          placeholder="e.g. 450"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        {budgetInvalid && <p className="mt-1 text-xs text-red-600">Enter an amount like 450 or 450.50</p>}
      </div>
      <ErrorNote error={save.error ?? remove.error} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={!name.trim() || budgetInvalid || save.isPending} onClick={submit}>
          Save
        </button>
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
      </div>
      {category && (
        <div className="flex gap-2">
          <button
            className="btn-secondary flex-1 text-sm"
            onClick={() => save.mutate({ ...category, archived: !category.archived }, { onSuccess: onDone })}
          >
            {category.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            className="btn-danger flex-1 text-sm"
            onClick={() => {
              if (confirm(`Delete “${category.name}”? Its entries are kept but lose their category. Archiving hides it instead.`)) {
                remove.mutate(category.id, { onSuccess: onDone })
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
