import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router'
import { Spinner } from './components/ui'
import { useMe, useProcessRecurring, useRealtimeSync } from './data/queries'
import { useSession } from './data/session'
import { LoginPage } from './features/auth/LoginPage'
import { BalancePage } from './features/balance/BalancePage'
import { MonthPage } from './features/balance/MonthPage'
import { SettlePage } from './features/balance/SettlePage'
import { EntryFormPage } from './features/entries/EntryFormPage'
import { LedgerPage } from './features/entries/LedgerPage'
import { HomePage } from './features/home/HomePage'
import { OnboardingPage } from './features/onboarding/OnboardingPage'
import { RecurringPage } from './features/recurring/RecurringPage'
import { TemplateFormPage } from './features/recurring/TemplateFormPage'
import { SettingsPage } from './features/settings/SettingsPage'

export function App() {
  const session = useSession()
  if (session === undefined) return <Spinner />
  if (session === null) return <LoginPage />
  return <HouseholdGate />
}

function HouseholdGate() {
  const { data: me, isLoading } = useMe()
  if (isLoading || !me) return <Spinner />
  if (!me.household_id) return <OnboardingPage />
  return <SignedInApp />
}

function SignedInApp() {
  useRealtimeSync()
  useProcessRecurring()
  return (
    <Routes>
      <Route element={<TabLayout />}>
        <Route index element={<HomePage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="balance" element={<BalancePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route element={<PlainLayout />}>
        <Route path="add" element={<EntryFormPage />} />
        <Route path="entry/:id" element={<EntryFormPage />} />
        <Route path="settle" element={<SettlePage />} />
        <Route path="balance/:month" element={<MonthPage />} />
        <Route path="recurring" element={<RecurringPage />} />
        <Route path="recurring/:id" element={<TemplateFormPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function PlainLayout() {
  return (
    <main className="mx-auto max-w-md px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <Outlet />
    </main>
  )
}

function TabLayout() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
      isActive ? 'text-brand-600' : 'text-slate-500 dark:text-slate-400'
    }`
  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-md items-center">
          <NavLink to="/" end className={tab}>
            <span className="text-xl">🏠</span>Home
          </NavLink>
          <NavLink to="/ledger" className={tab}>
            <span className="text-xl">📒</span>Ledger
          </NavLink>
          <NavLink
            to="/add"
            aria-label="Add expense"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-3xl text-white shadow-lg shadow-brand-600/30 active:scale-95"
          >
            +
          </NavLink>
          <NavLink to="/balance" className={tab}>
            <span className="text-xl">⚖️</span>Balance
          </NavLink>
          <NavLink to="/settings" className={tab}>
            <span className="text-xl">⚙️</span>Settings
          </NavLink>
        </div>
      </nav>
    </>
  )
}
