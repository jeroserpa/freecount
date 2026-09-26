import type { EntryKind, SplitType } from '../../domain/balance'
import { centsToInput, formatCents, parseEuros } from '../../domain/money'

/** Editable state of the entry fields (also used for recurring templates). */
export interface EntryDraft {
  kind: EntryKind
  amount: string
  categoryId: string | null
  payerId: string
  split: SplitType
  shareMode: 'amount' | 'percent'
  payerShare: string
  date: string
  note: string
}

export interface EntryLike {
  kind: EntryKind
  amount_cents: number
  category_id: string | null
  payer_id: string
  split_type: SplitType
  payer_share_cents: number | null
  note: string
}

export function draftFrom(source: EntryLike | undefined, defaults: { payerId: string; date: string }): EntryDraft {
  return {
    kind: source?.kind ?? 'expense',
    amount: source ? centsToInput(source.amount_cents) : '',
    categoryId: source?.category_id ?? null,
    payerId: source?.payer_id ?? defaults.payerId,
    split: source?.split_type ?? 'shared',
    shareMode: 'amount',
    payerShare: source?.payer_share_cents != null ? centsToInput(source.payer_share_cents) : '',
    date: defaults.date,
    note: source?.note ?? '',
  }
}

/** Custom split: part borne by the payer, from € or % input. */
export function customPayerShareCents(draft: EntryDraft): number | null {
  const amount = parseEuros(draft.amount)
  if (amount == null) return null
  if (draft.shareMode === 'amount') return parseEuros(draft.payerShare)
  if (draft.payerShare.trim() === '') return null
  const pct = Number(draft.payerShare.replace(',', '.'))
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null
  return Math.round((amount * pct) / 100)
}

export type DraftResult =
  | { ok: true; value: EntryLike }
  | { ok: false; error: string }

export function validateDraft(draft: EntryDraft, payerName: string): DraftResult {
  const amount_cents = parseEuros(draft.amount)
  if (!amount_cents) return { ok: false, error: 'Enter an amount' }
  let payer_share_cents: number | null = null
  if (draft.split === 'custom') {
    payer_share_cents = customPayerShareCents(draft)
    if (payer_share_cents == null || payer_share_cents > amount_cents) {
      return { ok: false, error: `${payerName}'s part must be between 0 and ${formatCents(amount_cents)}` }
    }
  }
  return {
    ok: true,
    value: {
      kind: draft.kind,
      amount_cents,
      category_id: draft.categoryId,
      payer_id: draft.payerId,
      split_type: draft.split,
      payer_share_cents,
      note: draft.note.trim(),
    },
  }
}
