import { Segmented } from '../../components/ui'
import { describeSchedule } from '../../domain/recurrence'
import { parseEvery, type ScheduleDraft } from './schedule'

export function ScheduleFields({
  schedule,
  onChange,
  startDate,
}: {
  schedule: ScheduleDraft
  onChange: (patch: Partial<ScheduleDraft>) => void
  startDate: string
}) {
  const every = parseEvery(schedule.every)
  const unit = { weekly: 'week', monthly: 'month', yearly: 'year' }[schedule.frequency]
  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60">
      <Segmented
        value={schedule.frequency}
        onChange={(frequency) => onChange({ frequency })}
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
      />
      <div className="flex items-center gap-2 text-sm">
        <span>Every</span>
        <input
          className="input w-16 py-1.5 text-center"
          inputMode="numeric"
          value={schedule.every}
          onChange={(e) => onChange({ every: e.target.value })}
          aria-label="Every"
        />
        <span>{unit}{every !== 1 ? 's' : ''}</span>
      </div>
      {every && startDate && (
        <p className="muted text-xs">{describeSchedule({ start_date: startDate, frequency: schedule.frequency, every })}</p>
      )}
      <Toggle
        label="⚡ Add automatically"
        checked={schedule.auto}
        onChange={(auto) => onChange({ auto })}
        hint={
          schedule.auto
            ? 'Added on its date with this amount (rent, subscriptions).'
            : 'Not added by itself: a “to confirm” reminder asks for the real amount (electricity, water).'
        }
      />
      <Toggle
        label="🔔 Notify us"
        checked={schedule.notify}
        onChange={(notify) => onChange({ notify })}
        hint={
          schedule.notify
            ? schedule.auto
              ? 'You both get a notification when it’s added.'
              : 'You get a notification when it’s due.'
            : schedule.auto
              ? 'Added silently.'
              : 'The reminder only shows on the Home screen.'
        }
      />
      <div>
        <label className="label" htmlFor="end-date">Ends (optional)</label>
        <input
          id="end-date"
          type="date"
          className="input"
          value={schedule.endDate}
          min={startDate}
          onChange={(e) => onChange({ endDate: e.target.value })}
        />
      </div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint: string
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <input
          type="checkbox"
          role="switch"
          className="h-5 w-5 accent-brand-600"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label.replace(/^\S+\s/, '')}
        />
      </span>
      <span className="muted mt-0.5 block text-xs">{hint}</span>
    </label>
  )
}
