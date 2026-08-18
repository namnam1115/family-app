import { IconClose, IconMail, IconSchedule } from '../lib/icons'
import Modal from './Modal'
import styles from './MemberInfoModal.module.css'

function formatJoinedAt(joinedAt) {
  if (!joinedAt) return null
  return new Date(joinedAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * 家族メンバーのアイコンタップで開く詳細モーダル。
 * props:
 *   member : { id, name, email, joined_at } | null（null なら非表示）
 *   isSelf : そのメンバーが自分自身かどうか
 *   onClose: 閉じる
 */
export default function MemberInfoModal({ member, isSelf, onClose }) {
  if (!member) return null

  const displayName = member.name || member.email || '名前未設定'
  const joinedLabel = formatJoinedAt(member.joined_at)

  return (
    <Modal open onClose={onClose} variant="plain" size="auto" className={styles.dialog}>
      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="閉じる">
        <IconClose />
      </button>
      <div className={styles.avatarLarge}>
        {(member.name || member.email || '?')[0].toUpperCase()}
      </div>
      <h2 className={styles.name}>
        {displayName}
        {isSelf && <span className={styles.selfBadge}>あなた</span>}
      </h2>
      <dl className={styles.details}>
        {member.email && (
          <div className={styles.detailRow}>
            <dt><IconMail /></dt>
            <dd>{member.email}</dd>
          </div>
        )}
        {joinedLabel && (
          <div className={styles.detailRow}>
            <dt><IconSchedule /></dt>
            <dd>{joinedLabel} に参加</dd>
          </div>
        )}
      </dl>
    </Modal>
  )
}
