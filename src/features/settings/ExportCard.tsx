import { useState } from 'react'
import { ErrorNote } from '../../components/ui'
import { errorMessage, fetchAllEntries, useCategories, useMembers } from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { todayISO } from '../../domain/dates'
import { downloadText, entriesToCsv } from '../stats/exportCsv'

export function ExportCard() {
  const { me, partner } = useMembers()
  const { data: categories = [] } = useCategories()
  const ratios = useMonthRatios()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportAll() {
    if (!me) return
    setBusy(true)
    setError(null)
    try {
      const entries = await fetchAllEntries()
      const csv = entriesToCsv(entries, { me, partner, categories, shareFor: (m) => ratios.ratioFor(m).shareMe })
      downloadText(`freecount-all-${todayISO()}.csv`, csv)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Your data</h2>
      <p className="muted text-sm">
        Download every entry you can see (shared ones and your personal ones) as a CSV file for any spreadsheet.
      </p>
      <button className="btn-secondary w-full" disabled={busy || !ratios.ready} onClick={exportAll}>
        {busy ? 'Preparing…' : '⬇ Export all entries (CSV)'}
      </button>
      {error && <ErrorNote error={error} />}
    </section>
  )
}
