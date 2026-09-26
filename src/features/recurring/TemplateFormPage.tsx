import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ErrorNote, PageHeader, Spinner } from '../../components/ui'
import {
  processRecurringNow,
  useCategories,
  useDeleteTemplate,
  useMembers,
  useSaveTemplate,
  useTemplates,
  type Category,
  type Profile,
  type Template,
} from '../../data/queries'
import { todayISO } from '../../domain/dates'
import { draftFrom, validateDraft, type EntryDraft } from '../entries/draft'
import { EntryFields } from '../entries/EntryFields'
import { ScheduleFields } from './ScheduleFields'
import { defaultSchedule, parseEvery, type ScheduleDraft } from './schedule'

/** /recurring/new and /recurring/:id */
export function TemplateFormPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const templates = useTemplates()
  const { me, partner } = useMembers()
  const { data: categories } = useCategories()

  if (!me || !categories || templates.isLoading) return <Spinner />
  const template = isNew ? undefined : templates.data?.find((t) => t.id === id)
  if (!isNew && !template) {
    return (
      <>
        <PageHeader title="Recurring" back="/recurring" />
        <ErrorNote error="Recurring expense not found" />
      </>
    )
  }
  return <TemplateForm key={id} template={template} me={me} partner={partner} categories={categories} />
}

function TemplateForm({
  template,
  me,
  partner,
  categories,
}: {
  template: Template | undefined
  me: Profile
  partner: Profile | null
  categories: Category[]
}) {
  const navigate = useNavigate()
  const save = useSaveTemplate()
  const remove = useDeleteTemplate()
  const [draft, setDraft] = useState<EntryDraft>(() =>
    draftFrom(template, { payerId: me.id, date: template?.next_due ?? todayISO() }),
  )
  const [schedule, setSchedule] = useState<ScheduleDraft>(
    template
      ? { frequency: template.frequency, every: String(template.every), mode: template.mode, endDate: template.end_date ?? '' }
      : defaultSchedule,
  )
  const [paused, setPaused] = useState(template?.paused ?? false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const payerName = draft.payerId === me.id ? 'You' : (partner?.display_name ?? 'Partner')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const result = validateDraft(draft, payerName)
    if (!result.ok) return setError(result.error)
    const every = parseEvery(schedule.every)
    if (!every) return setError('“Every” must be a whole number between 1 and 52')
    if (schedule.endDate && schedule.endDate < draft.date) return setError('The end date is before the next date')

    // Keep the original anchor unless the schedule itself changed, so a “31st” schedule doesn't
    // become a “30th” just because the next occurrence falls in a 30-day month.
    const rescheduled =
      !template ||
      template.next_due !== draft.date ||
      template.frequency !== schedule.frequency ||
      template.every !== every
    setBusy(true)
    try {
      await save.mutateAsync({
        id: template?.id ?? crypto.randomUUID(),
        household_id: me.household_id!,
        ...result.value,
        frequency: schedule.frequency,
        every,
        mode: schedule.mode,
        end_date: schedule.endDate || null,
        paused,
        start_date: rescheduled ? draft.date : template!.start_date,
        occurrences: rescheduled ? 0 : template!.occurrences,
      })
      await processRecurringNow().catch(() => {})
      navigate('/recurring')
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={template ? 'Edit recurring' : 'New recurring'}
        back="/recurring"
        action={
          <button className="btn-primary px-5 py-2" disabled={busy}>
            Save
          </button>
        }
      />
      <div className="space-y-5">
        <EntryFields
          draft={draft}
          onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          me={me}
          partner={partner}
          categories={categories}
          autoFocus={!template}
          dateLabel="Next date"
          sharedHint="Split with the ratio of the month each occurrence falls in."
          extra={
            <ScheduleFields
              schedule={schedule}
              onChange={(p) => setSchedule((s) => ({ ...s, ...p }))}
              startDate={draft.date}
            />
          }
        />
        <p className="muted -mt-2 text-xs">
          Changes apply to future occurrences only. Occurrences on or before today are added right after saving.
        </p>

        {template && (
          <label className="flex items-center justify-between">
            <span className="font-medium">⏸ Paused</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={paused}
              onChange={(e) => setPaused(e.target.checked)}
              aria-label="Paused"
            />
          </label>
        )}

        {error && <ErrorNote error={error} />}
        <ErrorNote error={remove.error} />

        {template && (
          <button
            type="button"
            className="btn-danger w-full"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm('Delete this recurring expense? Entries already added are kept.')) {
                remove.mutate(template.id, { onSuccess: () => navigate('/recurring') })
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
