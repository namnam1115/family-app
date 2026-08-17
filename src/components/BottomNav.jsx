import { useNavigate, useLocation } from 'react-router-dom'
import { IconHome, IconShopping, IconSchedule, IconTravel, IconPlaces } from '../lib/icons'
import styles from './BottomNav.module.css'

/**
 * アプリ横断のグローバルナビ（下部タブバー）。
 * 各ページの .page（flex 縦積み）の最後の子として置くと、
 * スクロール領域が自動で縮み、コンテンツと重ならずに固定表示される。
 *
 * 主要5アプリを常設。その他（価格・予算・おかず・在庫）はホームから辿る。
 */
const TABS = [
  { path: '/',          label: 'ホーム',   Icon: IconHome },
  { path: '/shopping',  label: '買い物',   Icon: IconShopping },
  { path: '/schedule',  label: '予定',     Icon: IconSchedule },
  { path: '/travels',   label: '旅行',     Icon: IconTravel },
  { path: '/places',    label: 'おでかけ', Icon: IconPlaces },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className={styles.nav} aria-label="アプリ切り替え">
      {TABS.map(tab => {
        const active = tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path)
        const { Icon } = tab
        return (
          <button
            key={tab.path}
            type="button"
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            <span className={styles.icon} aria-hidden="true"><Icon /></span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
