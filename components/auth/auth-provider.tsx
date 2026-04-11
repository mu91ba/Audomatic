'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
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
  const [loading, setLoading] = useState(true)
  const resolvedRef = useRef(false)

  // Resolve pending shares when a user signs in
  async function resolvePendingShares(signedInUser: User) {
    if (resolvedRef.current || !signedInUser.email) return
    resolvedRef.current = true
    try {
      const { error } = await supabase
        .from('audit_shares')
        .update({
          shared_with_user_id: signedInUser.id,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('shared_with_email', signedInUser.email)
        .is('shared_with_user_id', null)

      if (error) {
        // Non-fatal — shares will resolve on next login after RLS fix
        console.warn('Could not resolve pending shares:', error.message)
      }
    } catch (err) {
      console.warn('Error resolving pending shares:', err)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) resolvePendingShares(session.user)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' && session?.user) {
        resolvePendingShares(session.user)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}



