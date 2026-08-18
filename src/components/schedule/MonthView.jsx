import { useState, useEffect, useRef } from 'react'
import { getHoliday } from '../../lib/holidays'
import { SHIFT_COLORS, eventColor, masterId, toDateStr, isEventOnDay } from '../../lib/schedule'
import EventChip, { ShiftBlock } from './EventChip'
import styles from './Schedule.module.css'

const MONTH_DATE_ROW_H = 28

const MONTH_CHIP_H = 16

const MONTH_BAND_H = 16

const MONTH_MAX_CHIPS_CAP = 5

// 複数日 all_day イベントを週内の帯レーンに割り当てる（#5）

function isMultiDay(e) {
  return e.all_day && e.end_date && e.end_date !== e.start_date
}

function assignBandLanes(bands) {
  const lanes = []
  const sorted = [...bands].sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol))
  for (const b of sorted) {
    let placed = false
    for (let li = 0; li < lanes.length; li++) {
      if (lanes[li].every(x => b.startCol > x.endCol || b.endCol < x.startCol)) {
        lanes[li].push(b); b.lane = li; placed = true; break
      }
    }
    if (!placed) { b.lane = lanes.length; lanes.push([b]) }
  }
  return sorted
}

export default function MonthView({ grid, events, memberColorMap, baseDate, todayStr, unreadMap = {}, pollDates = {}, onPollClick, onDayClick, onEventClick, onOverflowClick, nurseMode, shiftDraft }) {
  const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']
  const currentMonth = baseDate.getMonth()
  const currentYear = baseDate.getFullYear()

  // 週を6行に分割
  const weeks = []
  for (let w = 0; w < 6; w++) weeks.push(grid.slice(w * 7, w * 7 + 7))

  // セル高さを測って1日あたり表示件数を可変化（#6）
  const gridRef = useRef(null)
  const [weekH, setWeekH] = useState(0)
  useEffect(() => {
    if (!gridRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWeekH(e.contentRect.height / 6)
    })
    ro.observe(gridRef.current)
    return () => ro.disconnect()
  }, [])

  function renderCellContent(date, bandLaneCount) {
    const dateStr = toDateStr(date)
    // 帯を除いた単日イベント（単日 all_day + 時間指定）
    const dayEvents = events
      .filter(e => !e.shift_type && !isMultiDay(e) && isEventOnDay(e, date))
      .sort((a, b) => {
        if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
        const aTime = a.all_day ? a.start_date : a.start_datetime
        const bTime = b.all_day ? b.start_date : b.start_datetime
        return aTime < bTime ? -1 : 1
      })
    const dayShifts = events.filter(e => e.shift_type && isEventOnDay(e, date))

    // 帯レーン分を差し引いた残り高さから件数を算出
    const avail = weekH - MONTH_DATE_ROW_H - bandLaneCount * MONTH_BAND_H - (dayShifts.length ? MONTH_BAND_H : 0)
    const cap = weekH > 0 ? Math.max(1, Math.min(MONTH_MAX_CHIPS_CAP, Math.floor(avail / MONTH_CHIP_H))) : 2
    const visibleEvents = dayEvents.slice(0, cap)
    const overflow = dayEvents.length - visibleEvents.length

    const hasPoll = pollDates[dateStr]?.length > 0

    return (
      <>
        {hasPoll && (
          <button
            type="button"
            className={styles.monthPoll}
            title={`日程調整中: ${pollDates[dateStr].join('、')}`}
            onClick={e => { e.stopPropagation(); onPollClick?.() }}
          >
            🗳️ 調整中
          </button>
        )}
        <div className={styles.monthEventList}>
          {visibleEvents.map(ev => (
            <EventChip key={ev.id} event={ev} color={eventColor(ev, memberColorMap)} compact showTime={!ev.all_day} unread={unreadMap[masterId(ev)]} onClick={e => { e.stopPropagation(); onEventClick?.(ev) }} />
          ))}
          {overflow > 0 && (
            <button type="button" className={styles.monthOverflow} onClick={e => { e.stopPropagation(); onOverflowClick?.(dateStr) }}>
              +{overflow}件
            </button>
          )}
        </div>
        {dayShifts.length > 0 && (
          <div className={styles.monthShiftList}>
            {dayShifts.map(ev => (
              <ShiftBlock key={ev.id} shiftType={ev.shift_type} compact onClick={e => { e.stopPropagation(); onEventClick?.(ev) }} />
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <div className={styles.monthWrapper}>
      <div className={styles.monthDayLabels}>
        {DAY_LABELS.map((label, i) => (
          <div key={label} className={`${styles.monthDayLabel} ${i === 5 ? styles.sat : ''} ${i === 6 ? styles.sun : ''}`}>
            {label}
          </div>
        ))}
      </div>
      <div className={styles.monthGrid} ref={gridRef}>
        {weeks.map((week, wi) => {
          // この週の帯（複数日 all_day）を算出
          const weekStartStr = toDateStr(week[0])
          const weekEndStr = toDateStr(week[6])
          const bands = []
          const seen = new Set()
          for (let col = 0; col < 7; col++) {
            for (const e of events) {
              if (!isMultiDay(e) || e.shift_type) continue
              if (seen.has(e.id)) continue
              if (!(e.start_date <= weekEndStr && (e.end_date || e.start_date) >= weekStartStr)) continue
              if (!isEventOnDay(e, week[col])) continue
              seen.add(e.id)
              const startCol = e.start_date < weekStartStr ? 0 : week.findIndex(d => toDateStr(d) === e.start_date)
              const endColRaw = (e.end_date || e.start_date) > weekEndStr ? 6 : week.findIndex(d => toDateStr(d) === (e.end_date || e.start_date))
              bands.push({ ev: e, startCol: startCol < 0 ? 0 : startCol, endCol: endColRaw < 0 ? 6 : endColRaw })
            }
          }
          assignBandLanes(bands)
          const laneCount = bands.reduce((m, b) => Math.max(m, b.lane + 1), 0)

          return (
            <div key={wi} className={styles.monthWeek}>
              {/* 日付・セル背景 */}
              <div className={styles.monthWeekRow}>
                {week.map((date, ci) => {
                  const dateStr = toDateStr(date)
                  const isToday = dateStr === todayStr
                  const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
                  const isSat = ci === 5
                  const isSun = ci === 6
                  const holiday = getHoliday(dateStr)

                  if (nurseMode) {
                    const draftShift = shiftDraft[dateStr] ?? null
                    return (
                      <div
                        key={dateStr}
                        className={`${styles.monthCell} ${styles.monthCellNurse} ${isToday ? styles.monthCellToday : ''} ${!isCurrentMonth ? styles.monthCellOtherMonth : ''}`}
                        style={draftShift ? { '--shift-color': SHIFT_COLORS[draftShift] } : {}}
                        role="button"
                        tabIndex={0}
                        aria-label={`${date.getMonth() + 1}月${date.getDate()}日`}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick(dateStr) } }}
                        onClick={() => onDayClick(dateStr)}
                      >
                        <span className={`${styles.monthDateNum} ${isToday ? styles.monthDateNumToday : ''} ${isSat ? styles.sat : ''} ${(isSun || holiday) ? styles.sun : ''} ${!isCurrentMonth ? styles.otherMonth : ''}`}>
                          {date.getDate()}
                        </span>
                        {draftShift && <div className={styles.nurseShiftBadge}>{draftShift}</div>}
                      </div>
                    )
                  }

                  return (
                    <div
                      key={dateStr}
                      className={`${styles.monthCell} ${isToday ? styles.monthCellToday : ''} ${!isCurrentMonth ? styles.monthCellOtherMonth : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${date.getMonth() + 1}月${date.getDate()}日${holiday ? ` ${holiday}` : ''}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick(dateStr) } }}
                      onClick={() => onDayClick(dateStr)}
                    >
                      <div className={styles.monthDateRow}>
                        <span className={`${styles.monthDateNum} ${isToday ? styles.monthDateNumToday : ''} ${isSat ? styles.sat : ''} ${(isSun || holiday) ? styles.sun : ''} ${!isCurrentMonth ? styles.otherMonth : ''}`}>
                          {date.getDate()}
                        </span>
                        {holiday && isCurrentMonth && <span className={styles.monthHolidayName}>{holiday}</span>}
                      </div>
                      {/* 帯レーン分のスペーサー（帯は上に絶対配置） */}
                      {laneCount > 0 && <div style={{ height: laneCount * MONTH_BAND_H }} />}
                      {renderCellContent(date, laneCount)}
                    </div>
                  )
                })}
              </div>

              {/* 複数日イベントの帯（セル上に重ねる #5） */}
              {!nurseMode && bands.map(b => (
                <button
                  key={`${b.ev.id}_${wi}`}
                  type="button"
                  className={styles.monthBand}
                  style={{
                    '--chip-color': eventColor(b.ev, memberColorMap),
                    left: `calc(${(b.startCol / 7) * 100}% + 2px)`,
                    width: `calc(${((b.endCol - b.startCol + 1) / 7) * 100}% - 4px)`,
                    top: MONTH_DATE_ROW_H + b.lane * MONTH_BAND_H,
                  }}
                  onClick={e => { e.stopPropagation(); onEventClick?.(b.ev) }}
                >
                  {b.ev.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 週タイムグリッド 定数 ─────────────────────────────────────
