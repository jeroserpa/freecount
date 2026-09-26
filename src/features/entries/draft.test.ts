import { describe, expect, it } from 'vitest'
import { customPayerShareCents, draftFrom, validateDraft, type EntryDraft } from './draft'

const base = (patch: Partial<EntryDraft>): EntryDraft => ({
  ...draftFrom(undefined, { payerId: 'me', date: '2026-09-26' }),
  ...patch,
})

describe('entry draft', () => {
  it('requires an amount', () => {
    expect(validateDraft(base({ amount: '' }), 'You')).toEqual({ ok: false, error: 'Enter an amount' })
    expect(validateDraft(base({ amount: '0' }), 'You').ok).toBe(false)
  })

  it('builds a shared entry', () => {
    expect(validateDraft(base({ amount: '12,50', note: ' Bread ' }), 'You')).toEqual({
      ok: true,
      value: {
        kind: 'expense', amount_cents: 1250, category_id: null, payer_id: 'me',
        split_type: 'shared', payer_share_cents: null, note: 'Bread',
      },
    })
  })

  it('custom split in € and %', () => {
    expect(customPayerShareCents(base({ amount: '100', split: 'custom', payerShare: '70' }))).toBe(7000)
    expect(customPayerShareCents(base({ amount: '33.33', split: 'custom', shareMode: 'percent', payerShare: '50' }))).toBe(1667)
    expect(customPayerShareCents(base({ amount: '10', split: 'custom', shareMode: 'percent', payerShare: '150' }))).toBeNull()
  })

  it('rejects a custom part larger than the amount', () => {
    const r = validateDraft(base({ amount: '10', split: 'custom', payerShare: '11' }), 'Ana')
    expect(r).toEqual({ ok: false, error: "Ana's part must be between 0 and €10.00" })
  })

  it('round-trips an existing entry', () => {
    const d = draftFrom(
      { kind: 'refund', amount_cents: 6000, category_id: 'c', payer_id: 'her', split_type: 'custom', payer_share_cents: 2000, note: 'x' },
      { payerId: 'me', date: '2026-09-01' },
    )
    expect(d).toMatchObject({ kind: 'refund', amount: '60.00', payerId: 'her', payerShare: '20.00', date: '2026-09-01' })
  })
})
