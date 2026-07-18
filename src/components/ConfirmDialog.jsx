import { useEffect } from 'react'
import styles from './ConfirmDialog.module.css'

/**
 * 破壊的操作の確認ダイアログ（全ページ共通）。
 * 各ページで local state（例: confirmTarget）に応じて open を切り替えて使う。
 *
 * props:
 *   open         : 表示フラグ
 *   title        : 見出し（任意）
 *   message      : 本文
 *   confirmLabel : 実行ボタン文言（既定「削除」）
 *   cancelLabel  : キャンセル文言（既定「キャンセル」）
 *   danger       : true で実行ボタンを危険色に（既定 true）
 *   onConfirm    : 実行時
 *   onCancel     : キャンセル/背景タップ/Escで閉じる
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '削除',
  cancelLabel = 'キャンセル',
  danger = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onCancel?.() }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.dialog}>
        {title && <h2 className={styles.title}>{title}</h2>}
        <p className={styles.message}>{message}</p>
        <div className={styles.btns}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.confirmBtn} ${danger ? styles.danger : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
