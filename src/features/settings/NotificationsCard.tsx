import { useEffect, useState } from 'react'
import { ErrorNote } from '../../components/ui'
import { disablePush, enablePush, getPushStatus, sendTestPush, type PushStatus } from '../../data/push'

const WHAT = [
  'your partner adds a shared expense, a refund or a transfer',
  'a month is closed',
  'a recurring bill is due (to confirm the amount)',
  'a recurring expense is added automatically',
]

export function NotificationsCard() {
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [info, setInfo] = useState('')

  useEffect(() => {
    getPushStatus().then(setStatus, () => setStatus('unsupported'))
  }, [])

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true)
    setError(null)
    setInfo('')
    try {
      await action()
      if (done) setInfo(done)
    } catch (e) {
      setError(e)
    } finally {
      setStatus(await getPushStatus().catch(() => 'unsupported' as const))
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">🔔 Notifications</h2>
        {status === 'enabled' && <span className="text-sm font-medium text-brand-600 dark:text-brand-400">On for this device</span>}
      </div>
      <div className="muted text-sm">
        Get notified when:
        <ul className="mt-1 list-disc pl-5">
          {WHAT.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>

      {status === 'ios-install' && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          On iPhone, notifications only work once the app is on your Home Screen: tap Share → “Add to Home Screen”,
          open Freecount from there, then come back here.
        </p>
      )}
      {status === 'unsupported' && <p className="muted text-sm">This browser doesn’t support notifications.</p>}
      {status === 'denied' && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Notifications are blocked for this app. Allow them in your phone or browser settings, then reload.
        </p>
      )}

      {status === 'disabled' && (
        <button className="btn-primary w-full" disabled={busy} onClick={() => run(enablePush, 'Notifications are on for this device.')}>
          Turn on for this device
        </button>
      )}
      {status === 'enabled' && (
        <div className="flex gap-2">
          <button
            className="btn-secondary flex-1"
            disabled={busy}
            onClick={() => run(sendTestPush, 'Test sent — it should arrive in a few seconds.')}
          >
            Send a test
          </button>
          <button className="btn-secondary flex-1" disabled={busy} onClick={() => run(disablePush)}>
            Turn off
          </button>
        </div>
      )}
      {info && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-600/20 dark:text-brand-100">{info}</p>}
      <ErrorNote error={error} />
      <p className="muted text-xs">Each phone or computer is turned on separately. Your personal expenses never notify anyone.</p>
    </section>
  )
}
