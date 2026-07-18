import { useEffect } from 'react'
import styles from './Toast.module.css'

/**
 * 画面下部に出る一時通知。任意でアクション（例: 取り消し）を持てる。
 *
 * props:
 *   message     : 表示文言
 *   actionLabel : アクションボタン文言（任意）
 *   onAction    : アクション押下時（任意）
 *   onClose     : 自動 or 手動クローズ時
 *   duration    : 自動クローズまでのms（既定5000, 0で自動クローズ無効）
 *   variant     : 'default' | 'error'
 */
export default function Toast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 5000,
  variant = 'default',
}) {
  useEffect(() => {
    if (!duration) return
    const t = setTimeout(() => onClose?.(), duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={`${styles.toast} ${variant === 'error' ? styles.error : ''}`}>
        <span className={styles.msg}>{message}</span>
        {actionLabel && (
          <button
            type="button"
            className={styles.action}
            onClick={() => { onAction?.(); }}
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="閉じる"
        >×</button>
      </div>
    </div>
  )
}
