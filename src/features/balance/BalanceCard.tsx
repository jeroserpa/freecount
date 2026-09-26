import { Link } from 'react-router'
import { formatCents } from '../../domain/money'

export function BalanceCard({
  net,
  partnerName,
  loading,
  estimated,
  showSettle = true,
}: {
  net: number
  partnerName: string
  loading: boolean
  estimated: boolean
  showSettle?: boolean
}) {
  return (
    <section className="card bg-gradient-to-br from-brand-600 to-brand-700 text-white ring-0 dark:from-brand-700 dark:to-emerald-900">
      <p className="text-sm text-white/80">Balance{estimated && !loading && net !== 0 ? ' · estimate' : ''}</p>
      {loading ? (
        <p className="py-2 text-2xl font-bold">…</p>
      ) : net === 0 ? (
        <p className="py-2 text-2xl font-bold">All square 🎉</p>
      ) : (
        <p className="py-2 text-2xl font-bold">
          {net > 0 ? `${partnerName} owes you` : `You owe ${partnerName}`}{' '}
          <span className="tabular-nums">{formatCents(Math.abs(net))}</span>
        </p>
      )}
      {estimated && !loading && (
        <p className="-mt-1 mb-1 text-xs text-white/75">Some open months use estimated incomes.</p>
      )}
      {showSettle && net !== 0 && !loading && (
        <Link to="/settle" className="btn mt-1 bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25">
          Settle up
        </Link>
      )}
    </section>
  )
}
