'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Session } from '@supabase/supabase-js'
import type { User } from '@/lib/types'

type AuthContextValue = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      const u = session?.user ?? null
      setUser(u ? { id: u.id, email: u.email!, full_name: u.user_metadata?.full_name } : null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        const u = session?.user ?? null
        setUser(u ? { id: u.id, email: u.email!, full_name: u.user_metadata?.full_name } : null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
    const u = data.user
    setUser({ id: u.id, email: u.email!, full_name: u.user_metadata?.full_name })
  }

  const handleSignUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await getSupabase().auth.signUp({
      email, password, options: { data: { full_name: fullName } }
    })
    if (error) throw error
    // If session is null, Supabase requires email confirmation before login
    if (!data.session) throw new Error('CONFIRM_EMAIL')
    const u = data.user
    if (u) setUser({ id: u.id, email: u.email!, full_name: fullName })
  }

  const handleSignOut = async () => {
    await getSupabase().auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn: handleSignIn, signUp: handleSignUp, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
