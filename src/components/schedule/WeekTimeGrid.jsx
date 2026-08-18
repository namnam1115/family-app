import { useState, useEffect, useRef } from 'react'
import { getHoliday } from '../../lib/holidays'
import { eventColor, masterId, toDateStr, formatTime, isEventOnDay } from '../../lib/schedule'
import EventChip, { ShiftBlock } from './EventChip'
import styles from './Schedule.module.css'

const PX_PER_HOUR = 64

const PX_PER_MIN = PX_PER_HOUR / 60

const TOTAL_HEIGHT = 24 * PX_PER_HOUR

const SNAP_MIN = 15

const GRID_HOURS = Array.from({ length: 24 }, (_, i) => i)

// 同日に重複するイベントを列分割してレイアウト

function layoutDay(events) {
  if (!events.length) return []
  const sorted = [...events].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
  const cols = []
  for (const ev of sorted) {
    const evStart = new Date(ev.start_datetime).getTime()
    let placed = false
    for (const col of cols) {
      if (new Date(col[col.length - 1].end_datetime).getTime() <= evStart) {
        col.push(ev); placed = true; break
      }
    }
    if (!placed) cols.push([ev])
  }
  const total = cols.length
  return cols.flatMap((col, ci) => col.map(ev => ({ ev, colIdx: ci, totalCols: total })))
}

// ── 現在時刻ライン ────────────────────────────────────────────

function CurrentTimeLine({ weekDates, todayStr }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const todayIdx = weekDates.findIndex(d => toDateStr(d) === todayStr)
  if (todayIdx === -1) return null
  const top = (now.getHours() * 60 + now.getMinutes()) * PX_PER_MIN
  return (
    <div
      className={styles.currentTimeLine}
      style={{ top, left: `${(todayIdx / 7) * 100}%`, width: `${100 / 7}%` }}
    />
  )
}

// ── 週タイムグリッドコンポーネント ────────────────────────────

export default function WeekTimeGrid({ weekDates, filteredEvents, memberColorMap, todayStr, unreadMap = {}, onEventClick, onEdit, onSlotClick }) {
  const scrollRef = useRef(null)
  const gridRef = useRef(null)
  const draggingRef = useRef(null)
  const onEditRef = useRef(onEdit)
  const weekDatesRef = useRef(weekDates)
  const [dragState, setDragState] = useState(null)

  useEffect(() => { onEditRef.current = onEdit }, [onEdit])
  useEffect(() => { weekDatesRef.current = weekDates }, [weekDates])

  // 初回表示で 7 時にスクロール
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * PX_PER_HOUR
  }, [])

  // グローバルドラッグイベント（マウス＋タッチ）
  useEffect(() => {
    function getPos(e) {
      const src = e.touches?.[0] ?? e
      return { x: src.clientX, y: src.clientY }
    }

    function onMove(e) {
      const d = draggingRef.current
      if (!d) return
      const { x, y } = getPos(e)
      const deltaMin = (y - d.startY) / PX_PER_MIN

      let next
      if (d.mode === 'move') {
        const snapped = Math.round((d.origStartMin + deltaMin) / SNAP_MIN) * SNAP_MIN
        const clamped = Math.max(0, Math.min(23 * 60, snapped))
        const newDay = xToDayIndex(x)
        next = {
          ...d,
          currentStartMin: clamped,
          currentEndMin: clamped + d.duration,
          currentDayIndex: newDay >= 0 ? newDay : d.currentDayIndex,
        }
      } else {
        const snapped = Math.round((d.origEndMin + deltaMin) / SNAP_MIN) * SNAP_MIN
        const clamped = Math.max(d.origStartMin + SNAP_MIN, Math.min(24 * 60, snapped))
        next = { ...d, currentEndMin: clamped }
      }

      draggingRef.current = next
      setDragState({ ...next })
      if (e.cancelable) e.preventDefault()
    }

    async function onUp() {
      const d = draggingRef.current
      if (!d) return
      draggingRef.current = null
      setDragState(null)

      const { event, mode, currentStartMin, currentEndMin, currentDayIndex,
              origStartMin, origEndMin, origDayIndex } = d
      if (mode === 'move' && currentDayIndex === origDayIndex && currentStartMin === origStartMin) return
      if (mode === 'resize' && currentEndMin === origEndMin) return

      const targetDate = weekDatesRef.current[currentDayIndex] ?? new Date(event.start_datetime)
      const newStart = new Date(targetDate)
      newStart.setHours(Math.floor(currentStartMin / 60), currentStartMin % 60, 0, 0)

      const endBase = mode === 'resize' ? new Date(event.start_datetime) : new Date(targetDate)
      const newEnd = new Date(endBase)
      newEnd.setHours(Math.floor(currentEndMin / 60), currentEndMin % 60, 0, 0)

      await onEditRef.current(event.id, {
        title: event.title,
        memo: event.memo,
        all_day: false,
        member_id: event.member_id,
        shift_type: event.shift_type,
        start_date: null,
        end_date: null,
        start_datetime: newStart.toISOString(),
        end_datetime: newEnd.toISOString(),
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, []) // マウント時に一度だけ登録

  function xToDayIndex(clientX) {
    if (!gridRef.current) return -1
    const rect = gridRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(6, Math.floor((clientX - rect.left) / (rect.width / 7))))
  }

  function yToMinutes(clientY) {
    if (!gridRef.current || !scrollRef.current) return 0
    const rect = gridRef.current.getBoundingClientRect()
    return (clientY - rect.top + scrollRef.current.scrollTop) / PX_PER_MIN
  }

  function onDragStart(e, event, mode) {
    e.stopPropagation()
    // 繰り返し予定のオカレンスはドラッグ編集不可（タップで詳細のみ）
    if (event.is_occurrence) return
    const src = e.touches?.[0] ?? e
    const origStart = new Date(event.start_datetime)
    const origEnd = new Date(event.end_datetime)
    const origStartMin = origStart.getHours() * 60 + origStart.getMinutes()
    const origEndMin = origEnd.getHours() * 60 + origEnd.getMinutes()
    const origDayIndex = weekDatesRef.current.findIndex(d => toDateStr(d) === toDateStr(origStart))
    const state = {
      event, mode,
      startY: src.clientY, startX: src.clientX,
      origStartMin, origEndMin, origDayIndex,
      duration: origEndMin - origStartMin,
      currentStartMin: origStartMin, currentEndMin: origEndMin,
      currentDayIndex: origDayIndex,
    }
    draggingRef.current = state
    setDragState(state)
    if (e.cancelable && e.preventDefault) e.preventDefault()
  }

  function onGridClick(e) {
    if (draggingRef.current) return
    const dayIndex = xToDayIndex(e.clientX)
    const snapped = Math.round(yToMinutes(e.clientY) / SNAP_MIN) * SNAP_MIN
    const date = weekDates[dayIndex]
    if (!date) return
    const dt = new Date(date)
    dt.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0)
    onSlotClick(dt)
  }

  const allDayByDay = weekDates.map(d => filteredEvents.filter(e => e.all_day && isEventOnDay(e, d)))
  const timedByDay = weekDates.map(d => filteredEvents.filter(e => !e.all_day && isEventOnDay(e, d)))
  const WLABELS = ['月', '火', '水', '木', '金', '土', '日']

  return (
    <div className={styles.weekWrapper}>
      {/* ── 曜日ヘッダー ── */}
      <div className={styles.weekHeaderRow}>
        <div className={styles.weekGutter} />
        {weekDates.map((date, idx) => {
          const ds = toDateStr(date)
          const isToday = ds === todayStr
          const isSat = idx === 5, isSun = idx === 6
          const holiday = getHoliday(ds)
          return (
            <div key={ds} className={`${styles.weekDayHead} ${isToday ? styles.weekDayHeadToday : ''}`} title={holiday || undefined}>
              <span className={`${styles.dayLabel} ${isSat ? styles.sat : ''} ${(isSun || holiday) ? styles.sun : ''}`}>{WLABELS[idx]}</span>
              <span className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ''} ${isSat ? styles.sat : ''} ${(isSun || holiday) ? styles.sun : ''}`}>{date.getDate()}</span>
            </div>
          )
        })}
      </div>

      {/* ── 終日行 ── */}
      <div className={styles.weekAllDayRow}>
        <div className={styles.weekGutter}><span className={styles.allDayLabel}>終日</span></div>
        {weekDates.map((date, idx) => (
          <div key={toDateStr(date)} className={styles.weekAllDayCell}>
            {allDayByDay[idx].map(ev => (
              ev.shift_type
                ? <ShiftBlock key={ev.id} shiftType={ev.shift_type} compact onClick={e => { e.stopPropagation(); onEventClick(ev) }} />
                : <EventChip key={ev.id} event={ev} color={eventColor(ev, memberColorMap)} compact unread={unreadMap[masterId(ev)]} onClick={e => { e.stopPropagation(); onEventClick(ev) }} />
            ))}
          </div>
        ))}
      </div>

      {/* ── 時間スクロールエリア ── */}
      <div className={styles.weekScrollArea} ref={scrollRef}>
        <div className={styles.weekTimeBody}>
          {/* 時刻ガター */}
          <div className={styles.weekGutter} style={{ height: TOTAL_HEIGHT, position: 'relative', flexShrink: 0 }}>
            {GRID_HOURS.map(h => (
              <div key={h} className={styles.timeLabel} style={{ top: h * PX_PER_HOUR }}>
                {h > 0 ? `${h}:00` : ''}
              </div>
            ))}
          </div>

          {/* グリッド本体 */}
          <div
            className={styles.weekDayGrid}
            ref={gridRef}
            style={{ height: TOTAL_HEIGHT, cursor: dragState ? 'grabbing' : 'default' }}
            onClick={onGridClick}
          >
            {/* 時間区切り線 */}
            {GRID_HOURS.map(h => (
              <div key={h} className={styles.hourLine} style={{ top: h * PX_PER_HOUR }} />
            ))}
            {GRID_HOURS.map(h => (
              <div key={`hh${h}`} className={styles.halfHourLine} style={{ top: h * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
            ))}
            {/* 曜日区切り線 */}
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={`d${i}`} className={styles.dayDivider} style={{ left: `${(i / 7) * 100}%` }} />
            ))}

            <CurrentTimeLine weekDates={weekDates} todayStr={todayStr} />

            {/* 時間指定イベント */}
            {timedByDay.flatMap((evs, dayIndex) =>
              layoutDay(evs).map(({ ev, colIdx, totalCols }) => {
                const origStart = new Date(ev.start_datetime)
                const origStartMin = origStart.getHours() * 60 + origStart.getMinutes()
                const origDuration = (new Date(ev.end_datetime) - origStart) / 60000

                const isDragging = dragState?.event.id === ev.id
                const ds = isDragging ? dragState : null

                const dispDay = ds?.mode === 'move' ? ds.currentDayIndex : dayIndex
                const dispStart = ds?.mode === 'move' ? ds.currentStartMin : origStartMin
                const dispEnd = ds?.mode === 'resize' ? ds.currentEndMin : dispStart + origDuration

                const top = dispStart * PX_PER_MIN
                const height = Math.max(22, (dispEnd - dispStart) * PX_PER_MIN)
                const leftPct = (dispDay / 7 + colIdx / (totalCols * 7)) * 100
                const widthPct = 100 / (totalCols * 7)
                const color = eventColor(ev, memberColorMap)

                return (
                  <div
                    key={ev.id}
                    className={`${styles.timedEventBlock} ${isDragging ? styles.timedEventDragging : ''}`}
                    style={{
                      top, height,
                      left: `calc(${leftPct}% + 1px)`,
                      width: `calc(${widthPct}% - 2px)`,
                      '--chip-color': color,
                    }}
                    onMouseDown={e => onDragStart(e, ev, 'move')}
                    onTouchStart={e => onDragStart(e, ev, 'move')}
                    onClick={e => { e.stopPropagation(); if (!draggingRef.current) onEventClick(ev) }}
                  >
                    <span className={styles.timedEventTitle}>
                      {unreadMap[masterId(ev)] && <span className={styles.unreadDot} aria-label="新着コメント" />}
                      {ev.is_occurrence && <span className={styles.recurBadge} aria-hidden="true">↻</span>}
                      {ev.title}
                    </span>
                    {height > 34 && (
                      <span className={styles.timedEventTime}>
                        {formatTime(ev.start_datetime)}–{formatTime(ev.end_datetime)}
                      </span>
                    )}
                    {!ev.is_occurrence && (
                      <div
                        className={styles.resizeHandle}
                        onMouseDown={e => { e.stopPropagation(); onDragStart(e, ev, 'resize') }}
                        onTouchStart={e => { e.stopPropagation(); onDragStart(e, ev, 'resize') }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── シフトブロック ────────────────────────────────────────────
