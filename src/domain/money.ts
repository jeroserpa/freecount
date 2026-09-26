// All money is handled as integer cents. Never use floats for stored amounts.

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

export function formatCents(cents: number): string {
  return eur.format(cents / 100)
}

/**
 * Parse a user-typed euro amount ("12", "12.5", "12,50", "1 234,56") into cents.
 * Returns null when the input is not a valid positive-or-zero amount with at most 2 decimals.
 */
export function parseEuros(input: string): number | null {
  const s = input.trim().replace(/[\s€]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** Cents → plain editable string ("12.50"), for prefilling inputs. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Compact euros for chart axes: €950, €1.2k, €12k. */
export function formatCompactCents(cents: number): string {
  const eur = cents / 100
  if (Math.abs(eur) >= 10000) return `€${Math.round(eur / 1000)}k`
  if (Math.abs(eur) >= 1000) return `€${(eur / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `€${Math.round(eur)}`
}
