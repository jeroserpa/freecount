// Offline support: persisted query cache + entry changes queued while offline.
//
// - Queries are cached in IndexedDB, so the app opens with the last known data even without network.
// - Saving/deleting an entry while offline is applied to the cache immediately (optimistic) and queued;
//   the queue survives reloads and replays in order when the connection comes back.
// - Other changes (settings, months, transfers...) need a connection and fail fast with an error.
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { MutationCache, onlineManager, QueryClient, useMutationState } from '@tanstack/react-query'
import { del, get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { Insert } from './database.types'
import { applyToBalanceList, applyToRangeList, removeFromList, toCachedEntry } from './optimistic'
import type { Entry } from './queries'
import { supabase } from './supabase'

export const ENTRY_SAVE = ['entries', 'save'] as const
export const ENTRY_DELETE = ['entries', 'delete'] as const
const WEEK = 7 * 24 * 60 * 60 * 1000

export type EntrySavePayload = Insert<'entries'> & { id: string }

// ─── Sync errors (changes made offline that the server rejected later) ─────
type Listener = () => void
let syncErrors: string[] = []
const listeners = new Set<Listener>()
function pushSyncError(message: string) {
  syncErrors = [...syncErrors, message]
  listeners.forEach((l) => l())
}
export function dismissSyncErrors() {
  syncErrors = []
  listeners.forEach((l) => l())
}
export function useSyncErrors() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => syncErrors,
  )
}

export function useIsOnline() {
  return useSyncExternalStore(
    (l) => onlineManager.subscribe(l),
    () => onlineManager.isOnline(),
  )
}

/** Number of entry changes waiting for the network. */
export function usePendingSyncCount() {
  return useMutationState({ filters: { status: 'pending' }, select: (m) => m.state.isPaused }).filter(Boolean).length
}

// ─── Query client ───────────────────────────────────────────

export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Serve the cache first; refetch when possible.
      queries: { staleTime: 30_000, retry: 1, gcTime: WEEK, networkMode: 'offlineFirst' },
      // Most changes need the server right away: fail fast offline instead of hanging.
      mutations: { networkMode: 'always' },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // Errors of changes that were queued offline have no form left to show them.
        if (mutation.options.meta?.queuedOffline) {
          const msg = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
          pushSyncError(msg)
        }
      },
    }),
  })

  // Remember which mutations were paused (queued) so their errors are surfaced globally.
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'pause') {
      event.mutation.options.meta = { ...event.mutation.options.meta, queuedOffline: true }
    }
  })

  const invalidateEntries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entries'] }),
      queryClient.invalidateQueries({ queryKey: ['entry'] }),
    ])

  // Defaults are registered by key so queued mutations can resume after a reload.
  queryClient.setMutationDefaults(ENTRY_SAVE, {
    networkMode: 'online',
    scope: { id: 'entries' }, // replay in order
    mutationFn: async (entry: EntrySavePayload) => {
      const { error } = await supabase.from('entries').upsert(entry)
      if (error) throw error
    },
    onMutate: async (payload: EntrySavePayload) => {
      await queryClient.cancelQueries({ queryKey: ['entries'] })
      const previous = queryClient.getQueryData<Entry>(['entry', payload.id]) ?? findCached(queryClient, payload.id)
      const entry = toCachedEntry(payload as Partial<Entry> & Pick<Entry, 'id'>, previous)
      updateEntryLists(queryClient, (list, key) => {
        const [, a, b] = key
        if (a === 'balance') return applyToBalanceList(list, entry) as Entry[]
        if (typeof a === 'string' && typeof b === 'string') return applyToRangeList(list, entry, a, b)
        return list
      })
      queryClient.setQueryData(['entry', entry.id], entry)
    },
    onSettled: invalidateEntries,
  })

  queryClient.setMutationDefaults(ENTRY_DELETE, {
    networkMode: 'online',
    scope: { id: 'entries' },
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('entries').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['entries'] })
      updateEntryLists(queryClient, (list) => removeFromList(list, id))
      queryClient.removeQueries({ queryKey: ['entry', id] })
    },
    onSettled: invalidateEntries,
  })

  return queryClient
}

function updateEntryLists(queryClient: QueryClient, fn: (list: Entry[], key: readonly unknown[]) => Entry[]) {
  for (const [key, data] of queryClient.getQueriesData<Entry[]>({ queryKey: ['entries'] })) {
    if (Array.isArray(data)) queryClient.setQueryData(key, fn(data, key))
  }
}

function findCached(queryClient: QueryClient, id: string): Entry | undefined {
  for (const [, data] of queryClient.getQueriesData<Entry[]>({ queryKey: ['entries'] })) {
    const hit = Array.isArray(data) ? data.find((e) => e.id === id) : undefined
    if (hit && 'household_id' in hit) return hit
  }
  return undefined
}

// ─── Persistence ────────────────────────────────────────────

export const persister = createAsyncStoragePersister({
  key: 'freecount-cache',
  throttleTime: 1000,
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
})

export const persistOptions = {
  persister,
  maxAge: WEEK,
  // Bump when cached data shapes change incompatibly.
  buster: 'v1',
}

export async function clearPersistedCache() {
  await persister.removeClient()
}
