import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import GroupSetup from '../components/GroupSetup'
import AppCard from '../components/AppCard'
import FamilyInfo from '../components/FamilyInfo'
import styles from './HomePage.module.css'

export default function HomePage() {
  const { user, loading, familyMember, signInWithGoogle, signOut } = useAuth()
  const [authError, setAuthError] = useState('')
  const navigate = useNavigate()

  if (loading) return <LoadingSpinner />

  async function handleSignIn() {
    try {
      setAuthError('')
      await signInWithGoogle()
    } catch (err) {
      setAuthError('ログインに失敗しました。もう一度お試しください。')
      console.error(err)
    }
  }

  // 未ログイン
  if (!user) {
    return (
      <div className={styles.loginPage}>
        <div className={styles.loginCard}>
          <div className={styles.logoArea}>
            <span className={styles.logoIcon}>🏠</span>
            <h1 className={styles.appTitle}>家族プラットフォーム</h1>
            <p className={styles.appDesc}>家族みんなで使えるアプリをまとめてひとつに</p>
          </div>
          <button className={styles.googleBtn} onClick={handleSignIn}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z"/>
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.1-9.7H2.7v6.2C6.7 42.8 14.8 48 24 48z"/>
              <path fill="#FBBC04" d="M10.9 28.8c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.7C1 17.2 0 20.5 0 24s1 6.8 2.7 10.2l8.2-5.4z"/>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.9 2.5 30.5 0 24 0 14.8 0 6.7 5.2 2.7 13.8l8.2 6.2C12.7 13.6 17.9 9.5 24 9.5z"/>
            </svg>
            Googleでログイン
          </button>
          {authError && <p className={styles.error}>{authError}</p>}
        </div>
      </div>
    )
  }

  // ログイン済み・グループ未所属
  if (!familyMember) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.headerLogo}>🏠</span>
          <span className={styles.headerTitle}>家族プラットフォーム</span>
          <button className={styles.signOutBtn} onClick={signOut}>ログアウト</button>
        </header>
        <main className={styles.main}>
          <GroupSetup />
        </main>
      </div>
    )
  }

  // ログイン済み・グループ所属済み
  const apps = [
    {
      id: 'shopping',
      title: '買い物リスト',
      description: '家族で共有できる買い物リスト。チェックするだけで即時同期。',
      icon: '🛒',
      path: '/shopping',
      available: true,
    },
    {
      id: 'price',
      title: '価格比較',
      description: '複数スーパーの商品価格を比較。最安値を一目で確認。',
      icon: '💰',
      path: '/price',
      available: true,
    },
    {
      id: 'places',
      title: 'お出かけリスト',
      description: '行きたい場所をまとめて共有。行ったら評価を残せる。',
      icon: '📍',
      path: '/places',
      available: true,
    },
    {
      id: 'budget',
      title: '予算管理',
      description: '月々の固定費を家族で管理。カテゴリ・メンバー別に把握。',
      icon: '📊',
      path: '/budget',
      available: true,
    },
    {
      id: 'schedule',
      title: 'スケジュール',
      description: '家族の予定を共有しよう（近日公開）',
      icon: '📅',
      path: '/schedule',
      available: false,
    },
    {
      id: 'memo',
      title: '共有メモ',
      description: '大切な情報を家族でメモ（近日公開）',
      icon: '📝',
      path: '/memo',
      available: false,
    },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerLogo}>🏠</span>
        <span className={styles.headerTitle}>家族プラットフォーム</span>
        <button className={styles.signOutBtn} onClick={signOut}>ログアウト</button>
      </header>
      <main className={styles.main}>
        <FamilyInfo />
        <section className={styles.appsSection}>
          <h2 className={styles.sectionTitle}>アプリ一覧</h2>
          <div className={styles.appGrid}>
            {apps.map(app => (
              <AppCard
                key={app.id}
                icon={app.icon}
                title={app.title}
                description={app.description}
                path={app.path}
                available={app.available}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
