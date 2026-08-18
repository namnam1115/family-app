import { useEffect, useState } from 'react'
import styles from './OfflineBanner.module.css'

/**
 * オフライン時に画面上部へ控えめに表示するバナー（アプリ全体で1つ）。
 * オフライン中の変更はキューされず失敗するため、「後で同期される」とは書かない。
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    function up() { setOnline(true) }
    function down() { setOnline(false) }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online) return null

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      オフラインです。この間の変更は保存されません。
    </div>
  )
}
