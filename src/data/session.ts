import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/** undefined = still loading, null = signed out */
export const SessionContext = createContext<Session | null | undefined>(undefined)

export function useSession() {
  return useContext(SessionContext)
}

/** Current user id; only call below the auth gate. */
export function useUserId(): string {
  const session = useSession()
  if (!session) throw new Error('useUserId called while signed out')
  return session.user.id
}
