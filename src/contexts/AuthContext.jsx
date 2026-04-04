import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [familyMember, setFamilyMember] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchFamilyMember(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchFamilyMember(session.user.id)
      } else {
        setFamilyMember(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchFamilyMember(userId) {
    try {
      const { data } = await supabase
        .from('family_members')
        .select('*, families(id, name)')
        .eq('user_id', userId)
        .maybeSingle()
      setFamilyMember(data)
    } catch (err) {
      console.error('家族メンバー取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setFamilyMember(null)
  }

  async function createFamily(name) {
    const { data: family, error: familyError } = await supabase
      .from('families')
      .insert({ name })
      .select()
      .single()
    if (familyError) throw familyError

    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        family_id: family.id,
        user_id: user.id,
        name: user.user_metadata?.full_name || user.email,
        email: user.email,
      })
    if (memberError) throw memberError

    await fetchFamilyMember(user.id)
  }

  async function joinFamily(familyId) {
    const { data: family, error: familyError } = await supabase
      .from('families')
      .select('id, name')
      .eq('id', familyId)
      .maybeSingle()
    if (familyError) throw familyError
    if (!family) throw new Error('家族グループが見つかりません')

    const { data: existing } = await supabase
      .from('family_members')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) throw new Error('すでに家族グループに参加しています')

    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        family_id: familyId,
        user_id: user.id,
        name: user.user_metadata?.full_name || user.email,
        email: user.email,
      })
    if (memberError) throw memberError

    await fetchFamilyMember(user.id)
  }

  const value = {
    user,
    loading,
    familyMember,
    signInWithGoogle,
    signOut,
    createFamily,
    joinFamily,
    refetchFamilyMember: () => user && fetchFamilyMember(user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
