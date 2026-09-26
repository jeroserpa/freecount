import type { Entry, Profile } from '../../data/queries'

export function splitLabel(entry: Pick<Entry, 'split_type' | 'payer_id'>, meId: string, partner: Profile | null) {
  switch (entry.split_type) {
    case 'personal':
      return '🔒 Personal'
    case 'shared':
      return 'Shared'
    case 'custom':
      return 'Custom split'
    case 'for_other':
      return entry.payer_id === meId ? `For ${partner?.display_name ?? 'partner'}` : 'For you'
  }
}
