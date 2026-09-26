import { useState } from 'react'
import { ErrorNote } from '../../components/ui'
import { signOut, useCreateHousehold, useJoinHousehold } from '../../data/queries'

export function OnboardingPage() {
  const [name, setName] = useState('Home')
  const [code, setCode] = useState('')
  const create = useCreateHousehold()
  const join = useJoinHousehold()

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold">Welcome 👋</h1>
      <p className="muted">One of you creates the shared space, the other joins it with the invite code.</p>

      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(name)
        }}
      >
        <h2 className="font-semibold">Start a new household</h2>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <ErrorNote error={create.error} />
        <button className="btn-primary w-full" disabled={create.isPending}>Create</button>
      </form>

      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          join.mutate(code)
        }}
      >
        <h2 className="font-semibold">Join your partner</h2>
        <input
          className="input font-mono uppercase tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code"
          autoCapitalize="characters"
          required
        />
        <ErrorNote error={join.error} />
        <button className="btn-secondary w-full" disabled={join.isPending}>Join</button>
      </form>

      <button className="muted text-sm underline" onClick={signOut}>Sign out</button>
    </main>
  )
}
