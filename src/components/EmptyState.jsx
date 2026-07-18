import styles from './EmptyState.module.css'

/**
 * 空データ時の共通表示。「アイコン＋一言＋主アクション」で
 * ユーザーが次に何をすればいいかを常に示す。
 *
 * props:
 *   icon        : 絵文字など（任意）
 *   title       : 主メッセージ
 *   description : 補足（任意）
 *   actionLabel : 主アクションのラベル（任意）
 *   onAction    : 主アクション押下時（任意）
 */
export default function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className={styles.empty}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {title && <p className={styles.title}>{title}</p>}
      {description && <p className={styles.desc}>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
