import type { Frequency } from '../../domain/recurrence'

export interface ScheduleDraft {
  frequency: Frequency
  every: string
  mode: 'auto' | 'reminder'
  endDate: string
}

export const defaultSchedule: ScheduleDraft = { frequency: 'monthly', every: '1', mode: 'auto', endDate: '' }

export function parseEvery(every: string): number | null {
  const n = Number(every)
  return Number.isInteger(n) && n >= 1 && n <= 52 ? n : null
}
