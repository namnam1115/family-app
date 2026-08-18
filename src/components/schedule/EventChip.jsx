import { SHIFT_COLORS, formatTime } from '../../lib/schedule'
import styles from './Schedule.module.css'

export function ShiftBlock({ shiftType, compact = false, onClick }) {
  const color = SHIFT_COLORS[shiftType] ?? '#8E81B5'
  return (
    <button
      className={`${styles.shiftBlock} ${compact ? styles.shiftBlockCompact : ''}`}
      style={{ '--shift-color': color }}
      onClick={onClick}
      title={shiftType}
    >
      {shiftType}
    </button>
  )
}

// ── イベントチップ ────────────────────────────────────────────

export default function EventChip({ event, color, showTime = false, compact = false, unread = false, onClick }) {
  return (
    <button
      className={`${styles.eventChip} ${compact ? styles.eventChipCompact : ''}`}
      style={{ '--chip-color': color }}
      onClick={onClick}
      title={event.title}
    >
      {unread && <span className={styles.unreadDot} aria-label="新着コメント" />}
      {showTime && <span className={styles.eventTime}>{formatTime(event.start_datetime)}</span>}
      <span className={styles.eventTitle}>
        {event.is_occurrence && <span className={styles.recurBadge} aria-hidden="true">↻</span>}
        {event.title}
      </span>
      {!compact && event.member?.name && <span className={styles.eventMember}>{event.member.name}</span>}
    </button>
  )
}

// ── イベント追加・編集モーダル ────────────────────────────────
