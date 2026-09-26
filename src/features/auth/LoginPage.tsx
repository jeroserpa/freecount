import { useState, type FormEvent } from 'react'
import { ErrorNote, Segmented } from '../../components/ui'
import { supabase } from '../../data/supabase'

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo('')
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
          })
    setBusy(false)
    if (error) {
      // The database refuses a third account (see supabase/migrations/…_signup_lock.sql).
      setError(
        mode === 'signup' && /database error saving new user|sign-ups are closed/i.test(error.message)
          ? 'Sign-ups are closed: this Freecount already has its two accounts.'
          : error,
      )
    } else if (mode === 'signup' && !data.session) setInfo('Check your inbox to confirm your email, then sign in.')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
        <h1 className="text-3xl font-bold">Freecount</h1>
        <p className="muted mt-1">Shared expenses for two</p>
      </div>

      <form onSubmit={submit} className="card space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
        />
        {mode === 'signup' && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <ErrorNote error={error} />
        {info && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{info}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </main>
  )
}
