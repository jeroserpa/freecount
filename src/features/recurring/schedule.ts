import type { Frequency } from '../../domain/recurrence'

export interface ScheduleDraft {
  frequency: Frequency
  every: string
  /** true: the entry is added on its date; false: a reminder asks to confirm the amount. */
  auto: boolean
  /** Push notification when an occurrence is added (or due, for reminders). */
  notify: boolean
  endDate: string
}

export const defaultSchedule: ScheduleDraft = {
  frequency: 'monthly',
  every: '1',
  auto: true,
  notify: true,
  endDate: '',
}

export function parseEvery(every: string): number | null {
  const n = Number(every)
  return Number.isInteger(n) && n >= 1 && n <= 52 ? n : null
}
