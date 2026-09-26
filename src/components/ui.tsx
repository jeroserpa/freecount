import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 bg-stone-50/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur dark:bg-stone-950/90">
      {back && (
        <Link to={back} className="-ml-2 rounded-full px-2 py-1 text-2xl leading-none" aria-label="Back">
          ‹
        </Link>
      )}
      <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
      {action}
    </header>
  )
}

/** Segmented control (iOS-style toggle between a few options). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-sm font-medium transition ${
            value === o.value ? 'bg-white shadow-sm dark:bg-stone-600' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>
}
