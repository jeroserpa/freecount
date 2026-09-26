import { useState } from 'react'
import { ErrorNote } from '../../components/ui'
import { errorMessage, fetchAllEntries, fetchBackup, useCategories, useMembers } from '../../data/queries'
import { useMonthRatios } from '../../data/ratios'
import { todayISO } from '../../domain/dates'
import { downloadText, entriesToCsv } from '../stats/exportCsv'

export function ExportCard() {
  const { me, partner } = useMembers()
  const { data: categories = [] } = useCategories()
  const ratios = useMonthRatios()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function backup() {
    setBusy(true)
    setError(null)
    try {
      const data = await fetchBackup()
      downloadText(`freecount-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

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
        Download everything you can see (shared data and your own personal entries).
      </p>
      <button className="btn-secondary w-full" disabled={busy || !ratios.ready} onClick={exportAll}>
        {busy ? 'Preparing…' : '⬇ All entries as a spreadsheet (CSV)'}
      </button>
      <button className="btn-secondary w-full" disabled={busy} onClick={backup}>
        ⬇ Full backup (JSON)
      </button>
      <p className="muted text-xs">
        The CSV opens in Excel / Google Sheets. The backup also contains categories, months, incomes, transfers,
        recurring expenses and yearly adjustments.
      </p>
      {error && <ErrorNote error={error} />}
    </section>
  )
}
