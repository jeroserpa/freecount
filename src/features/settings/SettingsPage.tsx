import { useState } from 'react'
import { ErrorNote, PageHeader, Spinner } from '../../components/ui'
import {
  signOut,
  useCategories,
  useHousehold,
  useMembers,
  useSaveCategory,
  useUpdateHousehold,
  useUpdateProfile,
  type Category,
  type Household,
  type Profile,
} from '../../data/queries'
import { useSession } from '../../data/session'
import { CategoryEditor } from './CategoryEditor'
import { InviteCard } from './InviteCard'
import { SplitCard } from './SplitCard'

export function SettingsPage() {
  const { me, partner } = useMembers()
  const { data: household } = useHousehold()
  const session = useSession()

  if (!me || !household) return <Spinner />
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <ProfileCard key={me.id + me.display_name + me.emoji} me={me} email={session?.user.email} />
        <HouseholdCard key={household.id + household.name} household={household} partner={partner} />
        <SplitCard household={household} me={me} partner={partner} />
        <CategoriesCard householdId={household.id} />
        <button className="btn-secondary w-full" onClick={signOut}>Sign out</button>
      </div>
    </>
  )
}

function ProfileCard({ me, email }: { me: Profile; email: string | undefined }) {
  const update = useUpdateProfile()
  const [name, setName] = useState(me.display_name)
  const [emoji, setEmoji] = useState(me.emoji)
  const dirty = name !== me.display_name || emoji !== me.emoji
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">You</h2>
      <p className="muted -mt-2 text-sm">{email}</p>
      <div className="flex gap-2">
        <input className="input w-16 text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      </div>
      <ErrorNote error={update.error} />
      {dirty && (
        <button
          className="btn-primary w-full"
          disabled={update.isPending || !name.trim()}
          onClick={() => update.mutate({ display_name: name.trim(), emoji: emoji.trim() || '🙂' })}
        >
          Save
        </button>
      )}
    </section>
  )
}

function HouseholdCard({ household, partner }: { household: Household; partner: Profile | null }) {
  const update = useUpdateHousehold()
  const [name, setName] = useState(household.name)
  return (
    <>
      <section className="card space-y-3">
        <h2 className="font-semibold">Household</h2>
        <div className="flex gap-2">
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Household name" />
          {name !== household.name && (
            <button
              className="btn-primary"
              disabled={!name.trim() || update.isPending}
              onClick={() => update.mutate({ id: household.id, name: name.trim() })}
            >
              Save
            </button>
          )}
        </div>
        <p className="muted text-sm">
          {partner ? `Shared with ${partner.emoji} ${partner.display_name}` : 'Waiting for your partner to join.'}
        </p>
        <ErrorNote error={update.error} />
      </section>
      {!partner && <InviteCard code={household.invite_code} />}
    </>
  )
}

function CategoriesCard({ householdId }: { householdId: string }) {
  const { data: categories = [] } = useCategories()
  const save = useSaveCategory()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)

  function move(c: Category, delta: -1 | 1) {
    const i = active.indexOf(c)
    const swap = active[i + delta]
    if (!swap) return
    // Re-number the whole list so equal sort_orders can't get stuck.
    const reordered = [...active]
    reordered[i] = swap
    reordered[i + delta] = c
    reordered.forEach((cat, idx) => {
      if (cat.sort_order !== idx + 1) save.mutate({ ...cat, sort_order: idx + 1 })
    })
  }

  const row = (c: Category) =>
    editing === c.id ? (
      <CategoryEditor key={c.id} category={c} householdId={householdId} onDone={() => setEditing(null)} />
    ) : (
      <div key={c.id} className="flex items-center gap-3 py-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: `${c.color}22` }}
        >
          {c.emoji}
        </span>
        <button className="flex-1 text-left" onClick={() => setEditing(c.id)}>
          {c.name}
        </button>
        {!c.archived && (
          <>
            <button className="muted px-2 text-lg" onClick={() => move(c, -1)} aria-label="Move up">↑</button>
            <button className="muted px-2 text-lg" onClick={() => move(c, 1)} aria-label="Move down">↓</button>
          </>
        )}
      </div>
    )

  return (
    <section className="card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Categories</h2>
        <button className="text-sm font-medium text-brand-600" onClick={() => setEditing('new')}>+ Add</button>
      </div>
      {editing === 'new' && (
        <CategoryEditor
          householdId={householdId}
          nextSortOrder={categories.length + 1}
          onDone={() => setEditing(null)}
        />
      )}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</div>
      {archived.length > 0 && (
        <>
          <h3 className="muted mt-4 text-xs font-semibold uppercase tracking-wide">Archived</h3>
          <div className="divide-y divide-slate-100 opacity-60 dark:divide-slate-800">{archived.map(row)}</div>
        </>
      )}
      <ErrorNote error={save.error} />
    </section>
  )
}
