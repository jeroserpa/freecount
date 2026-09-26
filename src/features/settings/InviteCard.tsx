import { useState } from 'react'

export function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <section className="card border-2 border-dashed border-brand-500/40">
      <h2 className="font-semibold">Invite your partner</h2>
      <p className="muted mt-1 text-sm">
        They create an account on this app, choose “Join”, and enter this code:
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-xl bg-stone-100 py-2 text-center font-mono text-2xl tracking-[0.3em] dark:bg-stone-800">
          {code}
        </code>
        <button
          className="btn-secondary"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => setCopied(true))
          }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </section>
  )
}
