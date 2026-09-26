import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { EntryKind, SplitType } from '../domain/balance'
import { todayISO } from '../domain/dates'
import type { Frequency } from '../domain/recurrence'
import type { Insert, Row, Update } from './database.types'
import { clearPersistedCache, ENTRY_DELETE, ENTRY_SAVE, type EntrySavePayload } from './offline'
import { useUserId } from './session'
import { supabase } from './supabase'

export type Profile = Row<'profiles'>
export type Household = Row<'households'>
export type Category = Row<'categories'>
export type Settlement = Row<'settlements'>
export type Period = Row<'periods'>
export type MonthlyIncome = Row<'monthly_incomes'>
export type Template = Omit<Row<'recurring_templates'>, 'kind' | 'split_type' | 'frequency' | 'mode'> & {
  kind: EntryKind
  split_type: SplitType
  frequency: Frequency
  mode: 'auto' | 'reminder'
}
export type PendingRecurring = Row<'pending_recurring'>
export type YearlyAdjustment = Row<'yearly_adjustments'>
export type Entry = Omit<Row<'entries'>, 'kind' | 'split_type'> & { kind: EntryKind; split_type: SplitType }

// PostgREST caps responses at 1000 rows: page through everything.
const PAGE = 1000
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

function check<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R['data']> {
  if (res.error) throw res.error
  return res.data as NonNullable<R['data']>
}

// ─── Queries ────────────────────────────────────────────────

export function useMe() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['me', userId],
    queryFn: async () => check(await supabase.from('profiles').select('*').eq('id', userId).single()),
  })
}

export function useHousehold() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: ['household', me?.household_id],
    enabled: !!me?.household_id,
    queryFn: async () => check(await supabase.from('households').select('*').eq('id', me!.household_id!).single()),
  })
}

/** Both household members; `me` and `partner` (partner is null until they join). */
export function useMembers() {
  const { data: me } = useMe()
  const query = useQuery({
    queryKey: ['members', me?.household_id],
    enabled: !!me?.household_id,
    queryFn: async () =>
      check(
        await supabase.from('profiles').select('*').eq('household_id', me!.household_id!).order('created_at'),
      ),
  })
  const members = query.data ?? []
  const self = members.find((m) => m.id === me?.id) ?? me ?? null
  const partner = members.find((m) => m.id !== me?.id) ?? null
  return { ...query, members, me: self, partner }
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () =>
      check(await supabase.from('categories').select('*').order('sort_order').order('name')),
  })
}

export function useEntries(from: string, toExclusive: string) {
  return useQuery({
    queryKey: ['entries', from, toExclusive],
    queryFn: async () =>
      (await fetchAll((a, b) =>
        supabase
          .from('entries')
          .select('*')
          .gte('date', from)
          .lt('date', toExclusive)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(a, b),
      )) as Entry[],
  })
}

export function useEntry(id: string | undefined) {
  return useQuery({
    queryKey: ['entry', id],
    enabled: !!id,
    queryFn: async () => check(await supabase.from('entries').select('*').eq('id', id!).single()) as Entry,
  })
}

export function useSettlements(from?: string, toExclusive?: string) {
  return useQuery({
    queryKey: ['settlements', from, toExclusive],
    queryFn: async () =>
      fetchAll((a, b) => {
        let q = supabase.from('settlements').select('*')
        if (from) q = q.gte('date', from)
        if (toExclusive) q = q.lt('date', toExclusive)
        return q.order('date', { ascending: false }).order('created_at', { ascending: false }).range(a, b)
      }),
  })
}

/** All non-personal entries (the only ones that affect the balance). */
export function useBalanceEntries() {
  return useQuery({
    queryKey: ['entries', 'balance'],
    queryFn: async () =>
      (await fetchAll((a, b) =>
        supabase
          .from('entries')
          .select('kind, amount_cents, payer_id, split_type, payer_share_cents, date')
          .neq('split_type', 'personal')
          .order('id')
          .range(a, b),
      )) as Pick<Entry, 'kind' | 'amount_cents' | 'payer_id' | 'split_type' | 'payer_share_cents' | 'date'>[],
  })
}

export function usePeriods() {
  return useQuery({
    queryKey: ['periods'],
    queryFn: async () => check(await supabase.from('periods').select('*').order('month')),
  })
}

export function useIncomes() {
  return useQuery({
    queryKey: ['incomes'],
    queryFn: async () => fetchAll((a, b) => supabase.from('monthly_incomes').select('*').order('month').range(a, b)),
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () =>
      (check(await supabase.from('recurring_templates').select('*').order('next_due'))) as Template[],
  })
}

export function usePendingRecurring() {
  return useQuery({
    queryKey: ['pending'],
    queryFn: async () =>
      check(await supabase.from('pending_recurring').select('*').eq('status', 'pending').order('due_date')),
  })
}

/**
 * Generate due recurring entries/reminders (the database also does it daily).
 * Runs on start and whenever the app comes back to the foreground on a new day.
 */
export function useProcessRecurring() {
  const queryClient = useQueryClient()
  useEffect(() => {
    let lastRun = ''
    async function run() {
      const today = todayISO()
      if (lastRun === today || document.visibilityState !== 'visible') return
      lastRun = today
      const { data, error } = await supabase.rpc('process_recurring', { p_today: today })
      if (error) {
        lastRun = ''
        return
      }
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      if (data && data > 0) {
        queryClient.invalidateQueries({ queryKey: ['entries'] })
        queryClient.invalidateQueries({ queryKey: ['pending'] })
      }
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [queryClient])
}

export function useYearlyAdjustments() {
  return useQuery({
    queryKey: ['adjustments'],
    queryFn: async () => check(await supabase.from('yearly_adjustments').select('*').order('year')),
  })
}

/** Keep both phones in sync: refetch when the other person changes something. */
export function useRealtimeSync() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('household-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['entries'] })
        queryClient.invalidateQueries({ queryKey: ['entry'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () =>
        queryClient.invalidateQueries({ queryKey: ['settlements'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () =>
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'periods' }, () =>
        queryClient.invalidateQueries({ queryKey: ['periods'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_incomes' }, () =>
        queryClient.invalidateQueries({ queryKey: ['incomes'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'households' }, () =>
        queryClient.invalidateQueries({ queryKey: ['household'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_templates' }, () =>
        queryClient.invalidateQueries({ queryKey: ['templates'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_recurring' }, () =>
        queryClient.invalidateQueries({ queryKey: ['pending'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yearly_adjustments' }, () =>
        queryClient.invalidateQueries({ queryKey: ['adjustments'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['members'] })
        queryClient.invalidateQueries({ queryKey: ['me'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}

// ─── Mutations ──────────────────────────────────────────────

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, keys: string[][]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  })
}

export function useCreateHousehold() {
  return useInvalidating(
    async (name: string) => check(await supabase.rpc('create_household', { p_name: name })),
    [['me'], ['categories']],
  )
}

export function useJoinHousehold() {
  return useInvalidating(
    async (code: string) => check(await supabase.rpc('join_household', { p_code: code })),
    [['me'], ['categories']],
  )
}

export function useUpdateProfile() {
  const userId = useUserId()
  return useInvalidating(
    async (patch: Update<'profiles'>) => check(await supabase.from('profiles').update(patch).eq('id', userId)),
    [['me'], ['members']],
  )
}

export function useUpdateHousehold() {
  return useInvalidating(
    async ({ id, ...patch }: Update<'households'> & { id: string }) =>
      check(await supabase.from('households').update(patch).eq('id', id)),
    [['household']],
  )
}

/** Saving/deleting entries works offline: see offline.ts (queued, optimistic, replayed in order). */
export function useSaveEntry() {
  return useMutation<void, Error, EntrySavePayload>({ mutationKey: ENTRY_SAVE })
}

export function useDeleteEntry() {
  return useMutation<void, Error, string>({ mutationKey: ENTRY_DELETE })
}

export function useSaveCategory() {
  return useInvalidating(
    async (category: Insert<'categories'>) => check(await supabase.from('categories').upsert(category)),
    [['categories']],
  )
}

export function useDeleteCategory() {
  return useInvalidating(
    async (id: string) => check(await supabase.from('categories').delete().eq('id', id)),
    [['categories'], ['entries']],
  )
}

export function useAddSettlement() {
  return useInvalidating(
    async (s: Insert<'settlements'>) => check(await supabase.from('settlements').insert(s)),
    [['settlements']],
  )
}

export function useDeleteSettlement() {
  return useInvalidating(
    async (id: string) => check(await supabase.from('settlements').delete().eq('id', id)),
    [['settlements']],
  )
}

export function useSaveIncome() {
  return useInvalidating(
    async (income: Insert<'monthly_incomes'>) => check(await supabase.from('monthly_incomes').upsert(income)),
    [['incomes']],
  )
}

export function useDeleteIncome() {
  return useInvalidating(
    async ({ profile_id, month }: { profile_id: string; month: string }) =>
      check(await supabase.from('monthly_incomes').delete().eq('profile_id', profile_id).eq('month', month)),
    [['incomes']],
  )
}

export function useClosePeriod() {
  return useInvalidating(
    async (period: Insert<'periods'>) => check(await supabase.from('periods').insert(period)),
    [['periods']],
  )
}

export function useReopenPeriod() {
  return useInvalidating(
    async ({ household_id, month }: { household_id: string; month: string }) =>
      check(await supabase.from('periods').delete().eq('household_id', household_id).eq('month', month)),
    [['periods']],
  )
}

export function useSaveTemplate() {
  return useInvalidating(
    async (t: Insert<'recurring_templates'> & { id: string }) =>
      check(await supabase.from('recurring_templates').upsert(t)),
    [['templates']],
  )
}

export function useDeleteTemplate() {
  return useInvalidating(
    async (id: string) => check(await supabase.from('recurring_templates').delete().eq('id', id)),
    [['templates'], ['pending']],
  )
}

export function useUpdatePending() {
  return useInvalidating(
    async ({ id, ...patch }: Update<'pending_recurring'> & { id: string }) =>
      check(await supabase.from('pending_recurring').update(patch).eq('id', id)),
    [['pending']],
  )
}

/** Every entry visible to me (shared + my personal), for exports. */
export async function fetchAllEntries(): Promise<Entry[]> {
  return (await fetchAll((a, b) => supabase.from('entries').select('*').order('date').order('id').range(a, b))) as Entry[]
}

/** Run the generator now (after creating or editing a template). */
export async function processRecurringNow() {
  const { error } = await supabase.rpc('process_recurring', { p_today: todayISO() })
  if (error) throw error
}

export function useSaveAdjustment() {
  return useInvalidating(
    async (a: Insert<'yearly_adjustments'>) => check(await supabase.from('yearly_adjustments').upsert(a)),
    [['adjustments']],
  )
}

export function useDeleteAdjustment() {
  return useInvalidating(
    async ({ household_id, year }: { household_id: string; year: number }) =>
      check(await supabase.from('yearly_adjustments').delete().eq('household_id', household_id).eq('year', year)),
    [['adjustments']],
  )
}

export async function signOut() {
  await supabase.auth.signOut()
  await clearPersistedCache()
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message)
  return String(err)
}
