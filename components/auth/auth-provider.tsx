'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { parseRole, DEFAULT_ROLE, type AppRole } from '@/lib/role'

interface AuthContextType {
  user: User | null
  session: Session | null
  /**
   * Read from the app_users table, not from the JWT. user_metadata is writable
   * by the account holder, so a role carried there could be edited from the
   * browser console (migration 019).
   */
  role: AppRole
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: DEFAULT_ROLE,
  loading: true,
  signOut: async () => {},
})

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE)
  const [loading, setLoading] = useState(true)
  const resolvedRef = useRef(false)

  /**
   * Claim any audits shared with this address before the account existed.
   *
   * This used to be a direct UPDATE on audit_shares. The policy behind it had
   * a USING clause and no WITH CHECK, which let a viewer repoint their own
   * share row at somebody else's audit_id. The policy is gone; the database
   * function only ever matches rows addressed to the caller's own JWT email.
   */
  const acceptPendingShares = useCallback(async () => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    try {
      const { error } = await supabase.rpc('accept_pending_shares')
      if (error) {
        // Non-fatal: the owner still sees the invite, and it resolves next login.
        console.warn('Could not claim pending shares:', error.message)
      }
    } catch (err) {
      console.warn('Error claiming pending shares:', err)
    }
  }, [])

  const loadRole = useCallback(async (signedInUser: User) => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('role')
        .eq('id', signedInUser.id)
        .maybeSingle()

      if (error) throw error
      setRole(parseRole(data?.role))
    } catch (err) {
      // Deny by default: a lookup failure must not read as full access.
      console.warn('Could not load account role:', err)
      setRole(DEFAULT_ROLE)
    }
  }, [])

  useEffect(() => {
    async function applySession(nextSession: Session | null) {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)

      if (nextSession?.user) {
        await acceptPendingShares()
        await loadRole(nextSession.user)
      } else {
        resolvedRef.current = false
        setRole(DEFAULT_ROLE)
      }
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => subscription.unsubscribe()
  }, [acceptPendingShares, loadRole])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
