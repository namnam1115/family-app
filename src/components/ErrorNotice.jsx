import { IconWarning } from '../lib/icons'
import styles from './ErrorNotice.module.css'

/**
 * データ取得に失敗したときのページ内表示（再試行つき）。
 * 描画中の例外は ErrorBoundary、こちらは fetch 失敗を担当する。
 */
export default function ErrorNotice({
  message = 'データを読み込めませんでした',
  description = '通信環境を確認して、もう一度お試しください。',
  onRetry,
}) {
  return (
    <div className={styles.notice} role="alert">
      <span className={styles.icon} aria-hidden="true"><IconWarning /></span>
      <p className={styles.title}>{message}</p>
      <p className={styles.desc}>{description}</p>
      {onRetry && (
        <button type="button" className={styles.retryBtn} onClick={onRetry}>
          再読み込み
        </button>
      )}
    </div>
  )
}
