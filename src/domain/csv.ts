// Minimal RFC 4180 CSV writer.

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  // Guard against formula injection when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Cents → "12.34" (dot decimal, no currency sign), for spreadsheets. */
export const centsToCsv = (cents: number) => (cents / 100).toFixed(2)
