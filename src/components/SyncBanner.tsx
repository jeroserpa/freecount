import { dismissSyncErrors, useIsOnline, usePendingSyncCount, useSyncErrors } from '../data/offline'

/** Offline notice, pending changes, and changes the server rejected after syncing. */
export function SyncBanner() {
  const online = useIsOnline()
  const pending = usePendingSyncCount()
  const errors = useSyncErrors()

  return (
    <>
      {(!online || pending > 0) && (
        <div
          role="status"
          className="mb-3 rounded-xl bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-200 dark:text-slate-900"
        >
          {online ? '🔄 Syncing' : '📴 Offline'}
          {pending > 0
            ? ` · ${pending} change${pending === 1 ? '' : 's'} waiting to sync`
            : ' · showing saved data. You can still add expenses.'}
        </div>
      )}
      {errors.length > 0 && (
        <div role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">⚠ Some offline changes couldn’t be saved:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button className="mt-1 underline" onClick={dismissSyncErrors}>
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}
