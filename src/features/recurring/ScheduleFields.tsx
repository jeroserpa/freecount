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
    <div className="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
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
      <Segmented
        value={schedule.mode}
        onChange={(mode) => onChange({ mode })}
        options={[
          { value: 'auto', label: '⚡ Add automatically' },
          { value: 'reminder', label: '🔔 Remind me' },
        ]}
      />
      <p className="muted text-xs">
        {schedule.mode === 'auto'
          ? 'Same amount every time (rent, subscriptions): the entry is added on its date.'
          : 'Variable amount (electricity, water): you get a reminder to confirm the real amount.'}
      </p>
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
