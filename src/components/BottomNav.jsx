import { useNavigate, useLocation } from 'react-router-dom'
import styles from './BottomNav.module.css'

/**
 * アプリ横断のグローバルナビ（下部タブバー）。
 * 各ページの .page（flex 縦積み）の最後の子として置くと、
 * スクロール領域が自動で縮み、コンテンツと重ならずに固定表示される。
 *
 * 主要5アプリを常設。その他（価格・予算・おかず・旅行）はホームから辿る。
 */
const TABS = [
  { path: '/',          label: 'ホーム',   icon: '🏠' },
  { path: '/shopping',  label: '買い物',   icon: '🛒' },
  { path: '/schedule',  label: '予定',     icon: '📅' },
  { path: '/inventory', label: '在庫',     icon: '📦' },
  { path: '/places',    label: 'おでかけ', icon: '📍' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className={styles.nav} aria-label="アプリ切り替え">
      {TABS.map(tab => {
        const active = tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path)
        return (
          <button
            key={tab.path}
            type="button"
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            <span className={styles.icon} aria-hidden="true">{tab.icon}</span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
