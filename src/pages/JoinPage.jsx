import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import styles from './JoinPage.module.css'

export default function JoinPage() {
  const { familyId } = useParams()
  const { user, loading, familyMember, signInWithGoogle, joinFamily } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('idle') // idle | joining | done | error
  const [errorMsg, setErrorMsg] = useState('')

  // ログイン済み＆グループ参加済みならホームへ
  useEffect(() => {
    if (!loading && user && familyMember) {
      navigate('/', { replace: true })
    }
  }, [loading, user, familyMember, navigate])

  // ログイン済み＆グループ未所属 → 自動的に参加試行
  useEffect(() => {
    if (!loading && user && !familyMember && status === 'idle') {
      handleJoin()
    }
  }, [loading, user, familyMember, status])

  async function handleJoin() {
    setStatus('joining')
    try {
      await joinFamily(familyId)
      setStatus('done')
      setTimeout(() => navigate('/', { replace: true }), 1500)
    } catch (err) {
      setErrorMsg(err.message || '参加に失敗しました。')
      setStatus('error')
    }
  }

  async function handleSignIn() {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/join/${familyId}` },
      })
    } catch (err) {
      setErrorMsg('ログインに失敗しました。')
    }
  }

  if (loading || status === 'joining') {
    return <LoadingSpinner message={status === 'joining' ? '参加中...' : '読み込み中...'} />
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon}>🏠</span>
        <h1 className={styles.title}>家族グループへの招待</h1>

        {status === 'done' && (
          <p className={styles.success}>参加しました！ホームへ移動します...</p>
        )}

        {status === 'error' && (
          <>
            <p className={styles.error}>{errorMsg}</p>
            <button className={styles.btn} onClick={() => navigate('/')}>ホームへ</button>
          </>
        )}

        {status === 'idle' && !user && (
          <>
            <p className={styles.desc}>
              家族グループへの招待リンクを開きました。
              <br />Googleでログインして参加してください。
            </p>
            <button className={styles.googleBtn} onClick={handleSignIn}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z"/>
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.1-9.7H2.7v6.2C6.7 42.8 14.8 48 24 48z"/>
                <path fill="#FBBC04" d="M10.9 28.8c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.7C1 17.2 0 20.5 0 24s1 6.8 2.7 10.2l8.2-5.4z"/>
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.9 2.5 30.5 0 24 0 14.8 0 6.7 5.2 2.7 13.8l8.2 6.2C12.7 13.6 17.9 9.5 24 9.5z"/>
              </svg>
              Googleでログインして参加
            </button>
          </>
        )}
      </div>
    </div>
  )
}
