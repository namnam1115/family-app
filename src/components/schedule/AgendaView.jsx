import { getHoliday } from '../../lib/holidays'
import {
  SHIFT_COLORS,
  eventColor,
  masterId,
  toDateStr,
  isEventOnDay,
  eventTimeLabel,
  sortDayEvents,
} from '../../lib/schedule'
import styles from './Schedule.module.css'

export default function AgendaView({ events, memberColorMap, baseDate, todayStr, unreadMap = {}, onEventClick }) {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const rows = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const dayEvents = sortDayEvents(events.filter(e => isEventOnDay(e, date)))
    if (dayEvents.length) rows.push({ date, dateStr: toDateStr(date), dayEvents })
  }

  if (rows.length === 0) {
    return <div className={styles.agendaEmpty}>この月の予定はありません</div>
  }

  const DOW = ['日', '月', '火', '水', '木', '金', '土']
  return (
    <div className={styles.agenda}>
      {rows.map(({ date, dateStr, dayEvents }) => {
        const isToday = dateStr === todayStr
        const dow = date.getDay()
        const holiday = getHoliday(dateStr)
        return (
          <div key={dateStr} className={styles.agendaDay}>
            <div className={`${styles.agendaDate} ${isToday ? styles.agendaDateToday : ''}`}>
              <span className={styles.agendaDateNum}>{date.getDate()}</span>
              <span className={`${styles.agendaDow} ${dow === 6 ? styles.sat : ''} ${(dow === 0 || holiday) ? styles.sun : ''}`}>{DOW[dow]}</span>
              {holiday && <span className={styles.agendaHoliday}>{holiday}</span>}
            </div>
            <div className={styles.agendaEvents}>
              {dayEvents.map(ev => (
                <button
                  key={ev.id}
                  className={styles.agendaEvent}
                  style={{ '--chip-color': ev.shift_type ? (SHIFT_COLORS[ev.shift_type] ?? '#8E81B5') : eventColor(ev, memberColorMap) }}
                  onClick={() => onEventClick(ev)}
                >
                  <span className={styles.agendaEventTime}>{ev.shift_type ? ev.shift_type : eventTimeLabel(ev)}</span>
                  <span className={styles.agendaEventTitle}>
                    {unreadMap[masterId(ev)] && <span className={styles.unreadDot} aria-label="新着コメント" />}
                    {ev.is_occurrence && <span className={styles.recurBadge} aria-hidden="true">↻</span>}
                    {ev.title}
                  </span>
                  {ev.member?.name && <span className={styles.agendaEventMember}>{ev.member.name}</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── デイビュー（その日の全予定 #1 #2） ────────────────────────
