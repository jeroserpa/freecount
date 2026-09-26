import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { ErrorNote, PageHeader, Spinner } from '../../components/ui'
import {
  processRecurringNow,
  useCategories,
  useDeleteEntry,
  useEntry,
  useMembers,
  usePendingRecurring,
  useSaveEntry,
  useSaveTemplate,
  useTemplates,
  useUpdatePending,
  type Category,
  type Entry,
  type PendingRecurring,
  type Profile,
  type Template,
} from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { formatDay, formatMonth, todayISO } from '../../domain/dates'
import { formatShare } from '../../domain/ratio'
import { ScheduleFields } from '../recurring/ScheduleFields'
import { defaultSchedule, parseEvery, type ScheduleDraft } from '../recurring/schedule'
import { draftFrom, validateDraft, type EntryDraft } from './draft'
import { EntryFields } from './EntryFields'

/** /add, /add?pending=<reminder id>, /entry/:id */
export function EntryFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const pendingId = params.get('pending')
  const existing = useEntry(id)
  const { me, partner } = useMembers()
  const { data: categories } = useCategories()
  const pending = usePendingRecurring()
  const templates = useTemplates()

  if (!me || !categories || (id && existing.isLoading)) return <Spinner />
  if (id && !existing.data) {
    return (
      <>
        <PageHeader title="Entry" back="/ledger" />
        <ErrorNote error={existing.error ?? 'Entry not found'} />
      </>
    )
  }
  let reminder: { pending: PendingRecurring; template: Template } | undefined
  if (pendingId) {
    if (pending.isLoading || templates.isLoading) return <Spinner />
    const p = pending.data?.find((x) => x.id === pendingId)
    const t = p && templates.data?.find((x) => x.id === p.template_id)
    if (p && t) reminder = { pending: p, template: t }
  }
  return (
    <EntryForm
      key={id ?? pendingId ?? 'new'}
      entry={existing.data}
      reminder={reminder}
      me={me}
      partner={partner}
      categories={categories}
      template={existing.data?.recurring_template_id ? templates.data?.find((t) => t.id === existing.data!.recurring_template_id) : undefined}
    />
  )
}

function EntryForm({
  entry,
  reminder,
  template,
  me,
  partner,
  categories,
}: {
  entry: Entry | undefined
  reminder: { pending: PendingRecurring; template: Template } | undefined
  template: Template | undefined
  me: Profile
  partner: Profile | null
  categories: Category[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const save = useSaveEntry()
  const saveTemplate = useSaveTemplate()
  const updatePending = useUpdatePending()
  const remove = useDeleteEntry()
  const ratios = useMonthRatios()

  const [draft, setDraft] = useState<EntryDraft>(() =>
    reminder
      ? {
          ...draftFrom(reminder.template, { payerId: me.id, date: reminder.pending.due_date }),
          amount: (reminder.pending.suggested_amount_cents / 100).toFixed(2),
        }
      : draftFrom(entry, { payerId: me.id, date: entry?.date ?? todayISO() }),
  )
  const [repeat, setRepeat] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleDraft>(defaultSchedule)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const change = (patch: Partial<EntryDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const payerName = draft.payerId === me.id ? 'You' : (partner?.display_name ?? 'Partner')
  const monthRatio = ratios.ratioFor(draft.date.slice(0, 7))
  // Shared entries of a closed month are locked (the database enforces it too).
  const originalLocked = !!entry && entry.split_type !== 'personal' && ratios.ratioFor(entry.date.slice(0, 7)).closed
  const locked = originalLocked || (draft.split !== 'personal' && monthRatio.closed)

  function goBack() {
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const result = validateDraft(draft, payerName)
    if (!result.ok) return setError(result.error)
    const every = parseEvery(schedule.every)
    if (repeat && !every) return setError('“Every” must be a whole number between 1 and 52')

    setBusy(true)
    try {
      let recurring_template_id = entry?.recurring_template_id ?? reminder?.template.id ?? null
      if (repeat && !entry && !reminder) {
        // The entry being added is the first occurrence of the new schedule.
        recurring_template_id = crypto.randomUUID()
        await saveTemplate.mutateAsync({
          id: recurring_template_id,
          household_id: me.household_id!,
          ...result.value,
          frequency: schedule.frequency,
          every: every!,
          mode: schedule.mode,
          start_date: draft.date,
          end_date: schedule.endDate || null,
          occurrences: 1,
        })
      }
      const entryId = entry?.id ?? crypto.randomUUID()
      await save.mutateAsync({
        id: entryId,
        household_id: me.household_id!,
        ...result.value,
        date: draft.date,
        recurring_template_id,
      })
      if (reminder) {
        await updatePending.mutateAsync({ id: reminder.pending.id, status: 'done', entry_id: entryId })
        // Next reminder suggests the amount just confirmed.
        if (result.value.amount_cents !== reminder.template.amount_cents) {
          const { next_due: _next, ...t } = reminder.template
          await saveTemplate.mutateAsync({ ...t, amount_cents: result.value.amount_cents })
        }
      }
      if (repeat) await processRecurringNow().catch(() => {})
      goBack()
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err))
    } finally {
      setBusy(false)
    }
  }

  const title = entry
    ? 'Edit'
    : reminder
      ? `Confirm: ${reminder.template.note || 'recurring expense'}`
      : draft.kind === 'refund'
        ? 'New refund'
        : 'New expense'

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={title}
        back="/"
        action={
          <button className="btn-primary px-5 py-2" disabled={busy || locked}>
            Save
          </button>
        }
      />

      <div className="space-y-5">
        {locked && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            🔒 {formatMonth((originalLocked ? entry!.date : draft.date).slice(0, 7))} is closed. Reopen it from the
            Balance tab to change shared entries.
          </p>
        )}
        {reminder && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-600/20 dark:text-brand-100">
            🔔 Due {formatDay(reminder.pending.due_date)}. Check the amount on the bill, then save.
          </p>
        )}
        {template && (
          <Link
            to={`/recurring/${template.id}`}
            className="block rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
          >
            🔁 Part of a recurring expense — edit the schedule ›
          </Link>
        )}

        <EntryFields
          draft={draft}
          onChange={change}
          me={me}
          partner={partner}
          categories={categories}
          autoFocus={!entry}
          sharedHint={
            partner
              ? `Split with this month’s ratio: you ${formatShare(monthRatio.shareMe)} · ${partner.display_name} ${formatShare(1 - monthRatio.shareMe)}${monthRatio.estimated && !monthRatio.closed ? ' (estimate, final when the month is closed)' : ''}.`
              : 'Split with the household ratio.'
          }
          extra={
            !entry && !reminder ? (
              <div>
                <label className="flex items-center justify-between">
                  <span className="font-medium">🔁 Repeat</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand-600"
                    checked={repeat}
                    onChange={(e) => setRepeat(e.target.checked)}
                    aria-label="Repeat"
                  />
                </label>
                {repeat && (
                  <div className="mt-2">
                    <ScheduleFields
                      schedule={schedule}
                      onChange={(p) => setSchedule((s) => ({ ...s, ...p }))}
                      startDate={draft.date}
                    />
                  </div>
                )}
              </div>
            ) : undefined
          }
        />

        {error && <ErrorNote error={error} />}
        <ErrorNote error={remove.error} />

        {reminder && (
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={updatePending.isPending}
            onClick={() => updatePending.mutate({ id: reminder.pending.id, status: 'skipped' }, { onSuccess: goBack })}
          >
            Skip this one
          </button>
        )}
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
