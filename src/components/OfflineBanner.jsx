import { useEffect, useState } from 'react'
import styles from './OfflineBanner.module.css'

/**
 * オフライン時に画面上部へ控えめに表示するバナー（アプリ全体で1つ）。
 * リアルタイム同期アプリのため「今つながっていない」ことを明示し、
 * 保存が反映されないのは不具合ではなく通信状態だと分かるようにする。
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
      オフラインです。変更はオンライン復帰後に同期されます。
    </div>
  )
}
