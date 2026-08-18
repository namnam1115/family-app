import { createContext, useCallback, useContext, useEffect, useState } from 'react'
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
    // 家族の作成とメンバー登録は RPC 内で一括して行う（031）
    const { error } = await supabase.rpc('create_family_with_owner', {
      p_name: name,
      p_member_name: user.user_metadata?.full_name || user.email,
    })
    if (error) throw error
    await fetchFamilyMember(user.id)
  }

  // JoinPage が useEffect の依存に入れるため、参照を固定しておく
  /** 招待トークンから家族名を引く（参加前の確認用）。無効なら null */
  const fetchInvite = useCallback(async (token) => {
    const { data, error } = await supabase.rpc('get_family_invite', { p_token: token })
    if (error) throw error
    return data?.[0] ?? null
  }, [])

  async function joinFamily(token) {
    const { error } = await supabase.rpc('join_family_with_invite', {
      p_token: token,
      p_member_name: user.user_metadata?.full_name || user.email,
    })
    if (error) throw error
    await fetchFamilyMember(user.id)
  }

  /** 招待リンク用のトークンを発行する（有効な招待があれば使い回される） */
  async function createInviteToken() {
    const { data, error } = await supabase.rpc('create_family_invite')
    if (error) throw error
    return data
  }

  const value = {
    user,
    loading,
    familyMember,
    signInWithGoogle,
    signOut,
    createFamily,
    joinFamily,
    fetchInvite,
    createInviteToken,
    refetchFamilyMember: () => user && fetchFamilyMember(user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
