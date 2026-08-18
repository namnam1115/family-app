import { getHoliday } from '../../lib/holidays'
import { SHIFT_COLORS, eventColor, masterId, isEventOnDay, eventTimeLabel, sortDayEvents } from '../../lib/schedule'
import Modal from '../Modal'
import styles from './Schedule.module.css'

export default function DayDetailModal({ dateStr, events, memberColorMap, unreadMap = {}, onEventClick, onAdd, onClose }) {
  const date = new Date(`${dateStr}T00:00:00`)
  const dayEvents = sortDayEvents(events.filter(e => isEventOnDay(e, date)))
  const label = date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
  const holiday = getHoliday(dateStr)

  return (
    <Modal
      open
      onClose={onClose}
      title={<>{label}{holiday && <span className={styles.dayHolidayTag}>{holiday}</span>}</>}
      variant="plain"
      size="auto"
      className={styles.sheet}
    >
      <div className={styles.dayList}>
        {dayEvents.length === 0 ? (
          <p className={styles.dayEmpty}>予定はありません</p>
        ) : (
          dayEvents.map(ev => (
            <button
              key={ev.id}
              className={styles.dayRow}
              style={{ '--chip-color': ev.shift_type ? (SHIFT_COLORS[ev.shift_type] ?? '#8E81B5') : eventColor(ev, memberColorMap) }}
              onClick={() => onEventClick(ev)}
            >
              <span className={styles.dayRowBar} />
              <span className={styles.dayRowTime}>{ev.shift_type ? ev.shift_type : eventTimeLabel(ev)}</span>
              <span className={styles.dayRowBody}>
                <span className={styles.dayRowTitle}>
                  {unreadMap[masterId(ev)] && <span className={styles.unreadDot} aria-label="新着コメント" />}
                  {ev.is_occurrence && <span className={styles.recurBadge} aria-hidden="true">↻</span>}
                  {ev.title}
                </span>
                {ev.member?.name && <span className={styles.dayRowMember}>{ev.member.name}</span>}
              </span>
            </button>
          ))
        )}
      </div>
      <div className={styles.dayAddBar}>
        <button className={styles.saveBtn} onClick={onAdd}>＋ この日に予定を追加</button>
      </div>
    </Modal>
  )
}

// ── 予定詳細ビュー（閲覧・コメント #5 #6 #9） ────────────────
