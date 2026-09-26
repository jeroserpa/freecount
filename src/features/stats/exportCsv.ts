import type { Category, Entry, Profile } from '../../data/queries'
import { userShareCents } from '../../domain/balance'
import { centsToCsv, toCsv } from '../../domain/csv'

const SPLIT_LABEL = { shared: 'shared', custom: 'custom', for_other: 'for the other', personal: 'personal' }

export function entriesToCsv(
  entries: Entry[],
  ctx: {
    me: Profile
    partner: Profile | null
    categories: Category[]
    shareFor: (month: string) => number
  },
): string {
  const cat = new Map(ctx.categories.map((c) => [c.id, c.name]))
  const name = (id: string) => (id === ctx.me.id ? ctx.me.display_name : (ctx.partner?.display_name ?? id))
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .map((e) => [
      e.date,
      e.kind,
      centsToCsv(e.amount_cents),
      e.category_id ? (cat.get(e.category_id) ?? '') : '',
      e.note,
      name(e.payer_id),
      SPLIT_LABEL[e.split_type],
      e.payer_share_cents != null ? centsToCsv(e.payer_share_cents) : '',
      centsToCsv(userShareCents(e, ctx.me.id, ctx.shareFor(e.date.slice(0, 7)))),
      e.recurring_template_id ? 'yes' : '',
    ])
  return toCsv(
    ['date', 'type', 'amount_eur', 'category', 'note', 'paid_or_received_by', 'split', 'payer_part_eur', 'cost_for_me_eur', 'recurring'],
    rows,
  )
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  // BOM so spreadsheet apps detect UTF-8 (emoji, accents).
  const blob = new Blob(['﻿', text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
