import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from '../lib/icons'
import styles from './Modal.module.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 全ページ共通のモーダル（モバイルはボトムシート、480px 以上で中央表示）。
 * Esc・背景タップで閉じる / 開いている間の背景スクロールロック /
 * フォーカストラップ・閉じた後のフォーカス復帰をここで一元的に担保する。
 *
 * props:
 *   open       : 表示フラグ（false で何も描画しない）
 *   onClose    : 閉じる要求（Esc / 背景タップ / × ボタン）
 *   title      : 見出し。省略するとヘッダーごと描画しない
 *   headerStart: 見出しの左に置く要素（戻るボタン等）
 *   variant    : 'card'（既定・不透明カード）| 'sheet'（グラス調・ヘッダー固定）
 *                'plain' はパネルの装飾を持たず className 側のスタイルに委ねる
 *   size       : 'sm' 380px | 'md' 480px（既定）| 'lg' 640px | 'auto'（幅指定なし）
 *   className  : パネルへの追加クラス（ページ固有の調整用）
 *   closeOnOverlay : 背景タップで閉じるか（既定 true）
 */
export default function Modal({
  open,
  onClose,
  title,
  headerStart,
  variant = 'card',
  size = 'md',
  className = '',
  closeOnOverlay = true,
  children,
}) {
  const panelRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // autoFocus 指定の要素を尊重し、なければパネル自体にフォーカスを移す
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector('[autofocus]') || panel
      target.focus?.()
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className={styles.overlay}
      onClick={e => { if (closeOnOverlay && e.target === e.currentTarget) onClose?.() }}
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles[variant] ?? ''} ${styles[size] ?? ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className={styles.header}>
            {headerStart}
            <h2 className={styles.title} id={titleId}>{title}</h2>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="閉じる">
              <IconClose />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}
