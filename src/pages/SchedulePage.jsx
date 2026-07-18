import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import BottomNav from '../components/BottomNav'
import styles from './SchedulePage.module.css'

// ── 定数 ─────────────────────────────────────────────────────

const MEMBER_COLORS = [
  '#8E81B5', '#C2826A', '#5A9E82', '#C49A5A',
  '#6B9EC2', '#C26B8E', '#6BC2B4', '#9E6BC2',
]

const SHIFT_TYPES = ['日勤', '夜勤', '明け', '休み']
const SHIFT_COLORS = {
  '日勤': '#3B82F6',
  '夜勤': '#7C3AED',
  '明け': '#F59E0B',
  '休み': '#10B981',
}

function cycleShift(current) {
  if (!current) return '日勤'
  const idx = SHIFT_TYPES.indexOf(current)
  return idx === SHIFT_TYPES.length - 1 ? null : SHIFT_TYPES[idx + 1]
}

// ── 日付ユーティリティ ────────────────────────────────────────

function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function isEventOnDay(event, date) {
  const dateStr = toDateStr(date)
  if (event.all_day) {
    const start = event.start_date
    const end = event.end_date || event.start_date
    return dateStr >= start && dateStr <= end
  } else {
    const startStr = toDateStr(new Date(event.start_datetime))
    const endStr = toDateStr(new Date(event.end_datetime))
    return dateStr >= startStr && dateStr <= endStr
  }
}

function getWeekDates(baseDate) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date
  })
}

function getMonthGrid(baseDate) {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(firstDay)
  gridStart.setDate(1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    return date
  })
}

// ── メインコンポーネント ──────────────────────────────────────

export default function SchedulePage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('month')
  const [baseDate, setBaseDate] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [addDefaultDate, setAddDefaultDate] = useState(null)
  const [addDefaultStartDt, setAddDefaultStartDt] = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  // 看護師モード
  const [nurseMode, setNurseMode] = useState(false)
  const [shiftDraft, setShiftDraft] = useState({})   // { dateStr: shift_type }
  const [initialShifts, setInitialShifts] = useState({})
  const [nurseSaving, setNurseSaving] = useState(false)

  // メンバーフィルタ（空配列 = 全員表示）
  const [selectedMemberIds, setSelectedMemberIds] = useState([])

  // ヘッダーの「⋯」メニュー開閉
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate])
  const monthGrid = useMemo(() => getMonthGrid(baseDate), [baseDate])

  // 表示中の日付範囲（取得の絞り込みに使用）
  const visibleRange = useMemo(() => {
    if (viewMode === 'week') {
      return { start: toDateStr(weekDates[0]), end: toDateStr(weekDates[6]) }
    }
    return { start: toDateStr(monthGrid[0]), end: toDateStr(monthGrid[41]) }
  }, [viewMode, weekDates, monthGrid])

  // ── データ取得 ────────────────────────────────────────────

  // メンバー一覧：家族変更時のみ再取得
  const fetchMembers = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { data: mem } = await supabase
      .from('family_members')
      .select('id, name')
      .eq('family_id', familyMember.family_id)
    if (mem) setMembers(mem)
  }, [familyMember?.family_id])

  // イベント：表示中の範囲のみ取得
  // 複数日イベントの重複も考慮した OR フィルタ:
  //   - 終日・単日: start_date が範囲内
  //   - 終日・複数日: start_date <= end AND end_date >= start（範囲にまたがる）
  //   - 時間指定: start_datetime ～ end_datetime が範囲と重なる
  const fetchEvents = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { start, end } = visibleRange
    const orFilter = [
      `and(all_day.eq.true,start_date.gte.${start},start_date.lte.${end},end_date.is.null)`,
      `and(all_day.eq.true,start_date.lte.${end},end_date.gte.${start})`,
      `and(all_day.eq.false,start_datetime.lte.${end}T23:59:59Z,end_datetime.gte.${start}T00:00:00Z)`,
    ].join(',')
    const { data: ev } = await supabase
      .from('schedule_events')
      .select('*, member:family_members!schedule_events_member_id_fkey(id, name)')
      .eq('family_id', familyMember.family_id)
      .or(orFilter)
      .order('start_datetime', { ascending: true, nullsFirst: false })
      .order('start_date', { ascending: true })
    if (ev) setEvents(ev)
    setLoading(false)
  }, [familyMember?.family_id, visibleRange])

  useEffect(() => { fetchMembers() }, [fetchMembers])
  useEffect(() => { fetchEvents() }, [fetchEvents])

  // リアルタイム購読：家族変更時のみ再接続し、月移動で不要な再接続を避ける
  const fetchEventsRef = useRef(fetchEvents)
  useEffect(() => { fetchEventsRef.current = fetchEvents }, [fetchEvents])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const ch = supabase
      .channel('schedule_events_rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_events',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, () => fetchEventsRef.current())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [familyMember?.family_id])

  const memberColorMap = useMemo(() => {
    const map = {}
    members.forEach((m, i) => { map[m.id] = MEMBER_COLORS[i % MEMBER_COLORS.length] })
    return map
  }, [members])

  // ── 通常 CRUD ─────────────────────────────────────────────
  async function handleAdd(data) {
    const { data: inserted } = await supabase
      .from('schedule_events')
      .insert({ family_id: familyMember.family_id, ...data })
      .select('id')
      .single()
    if (inserted?.id) {
      await supabase.from('schedule_event_history').insert({
        event_id: inserted.id,
        family_id: familyMember.family_id,
        changed_by: familyMember.id,
        changed_by_name: familyMember.name,
        action: 'created',
        snapshot: data,
      })
    }
    await fetchEvents()
  }
  async function handleEdit(id, data) {
    await supabase.from('schedule_events').update(data).eq('id', id)
    await supabase.from('schedule_event_history').insert({
      event_id: id,
      family_id: familyMember.family_id,
      changed_by: familyMember.id,
      changed_by_name: familyMember.name,
      action: 'updated',
      snapshot: data,
    })
    await fetchEvents()
  }
  async function handleDelete(id) {
    await supabase.from('schedule_events').delete().eq('id', id)
    await fetchEvents()
  }

  // ── ナビゲーション ────────────────────────────────────────
  function prev() {
    if (nurseMode) return
    const d = new Date(baseDate)
    if (viewMode === 'week') { d.setDate(d.getDate() - 7) }
    else { d.setDate(1); d.setMonth(d.getMonth() - 1) }
    setBaseDate(d)
  }
  function next() {
    if (nurseMode) return
    const d = new Date(baseDate)
    if (viewMode === 'week') { d.setDate(d.getDate() + 7) }
    else { d.setDate(1); d.setMonth(d.getMonth() + 1) }
    setBaseDate(d)
  }

  const todayStr = toDateStr(new Date())
  const isCurrentPeriod = viewMode === 'week'
    ? weekDates.some(d => toDateStr(d) === todayStr)
    : baseDate.getFullYear() === new Date().getFullYear() && baseDate.getMonth() === new Date().getMonth()

  const navLabel = viewMode === 'week'
    ? `${weekDates[0].toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜 ${weekDates[6].toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}`
    : `${baseDate.getFullYear()}年${baseDate.getMonth() + 1}月`

  // ── 看護師モード ──────────────────────────────────────────
  function enableNurseMode() {
    setViewMode('month')
    const existing = {}
    events.forEach(e => {
      if (e.shift_type && e.member_id === familyMember?.id && e.start_date) {
        existing[e.start_date] = e.shift_type
      }
    })
    setInitialShifts(existing)
    setShiftDraft({ ...existing })
    setNurseMode(true)
  }

  function cancelNurseMode() {
    setNurseMode(false)
    setShiftDraft({})
    setInitialShifts({})
  }

  function handleNurseDayTap(dateStr) {
    setShiftDraft(prev => {
      const current = prev[dateStr] ?? null
      const next = cycleShift(current)
      if (next === null) {
        const { [dateStr]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [dateStr]: next }
    })
  }

  async function handleSaveShifts() {
    const affectedDates = [...new Set([...Object.keys(initialShifts), ...Object.keys(shiftDraft)])]
    setNurseSaving(true)

    // 変更対象の日付の既存シフトを全削除
    if (affectedDates.length > 0) {
      await supabase
        .from('schedule_events')
        .delete()
        .eq('family_id', familyMember.family_id)
        .eq('member_id', familyMember.id)
        .not('shift_type', 'is', null)
        .in('start_date', affectedDates)
    }

    // ドラフトを一括登録
    const inserts = Object.entries(shiftDraft).map(([date, shift]) => ({
      family_id: familyMember.family_id,
      member_id: familyMember.id,
      title: shift,
      all_day: true,
      start_date: date,
      end_date: null,
      start_datetime: null,
      end_datetime: null,
      shift_type: shift,
    }))
    if (inserts.length > 0) {
      await supabase.from('schedule_events').insert(inserts)
    }

    await fetchEvents()
    setNurseSaving(false)
    cancelNurseMode()
  }

  function toggleMember(memberId) {
    setSelectedMemberIds(prev => {
      if (prev.length === 0) return [memberId]
      if (prev.includes(memberId)) return prev.filter(id => id !== memberId)
      return [...prev, memberId]
    })
  }

  // メンバーフィルタ適用済みイベント
  const filteredEvents = useMemo(() => {
    if (selectedMemberIds.length === 0) return events
    return events.filter(e => !e.member_id || selectedMemberIds.includes(e.member_id))
  }, [events, selectedMemberIds])

  // 週表示用
  const eventsByDay = useMemo(() => {
    return weekDates.map(date => ({
      date,
      allDayEvents: filteredEvents.filter(e => e.all_day && isEventOnDay(e, date)),
      timedEvents: filteredEvents
        .filter(e => !e.all_day && isEventOnDay(e, date))
        .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime)),
    }))
  }, [filteredEvents, weekDates])

  const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

  return (
    <div className={styles.page}>
      {/* ── ヘッダー ── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る">
          <BsHouseFill />
        </button>
        <h1 className={styles.headerTitle}>📅 スケジュール</h1>

        {nurseMode ? (
          /* 勤務入力モード中：終了ボタンを明示 */
          <button
            className={styles.nurseExitBtn}
            onClick={cancelNurseMode}
            aria-label="勤務入力モードを終了"
          >
            <span aria-hidden="true">✕</span> 勤務モード終了
          </button>
        ) : (
          <>
            {/* その他メニュー（勤務入力モードなど、頻度の低い操作を格納） */}
            <div className={styles.headerMenuWrap}>
              <button
                className={styles.menuBtn}
                onClick={() => setHeaderMenuOpen(v => !v)}
                aria-label="その他のメニュー"
                aria-haspopup="menu"
                aria-expanded={headerMenuOpen}
              >⋯</button>
              {headerMenuOpen && (
                <>
                  <div className={styles.menuBackdrop} onClick={() => setHeaderMenuOpen(false)} />
                  <div className={styles.headerMenu} role="menu">
                    <button
                      className={styles.headerMenuItem}
                      role="menuitem"
                      onClick={() => { setHeaderMenuOpen(false); enableNurseMode() }}
                    >
                      <span className={styles.headerMenuIcon} aria-hidden="true">👩‍⚕️</span>
                      勤務入力モード
                    </button>
                  </div>
                </>
              )}
            </div>

            <button className={styles.addHeaderBtn} onClick={() => { setAddDefaultDate(null); setShowAdd(true) }} aria-label="予定を追加">＋</button>
          </>
        )}
      </header>

      {/* ── ナビゲーション（月週トグルもここに） ── */}
      <div className={styles.weekNav}>
        <button className={styles.navBtn} onClick={prev} disabled={nurseMode} aria-label="前へ">‹</button>
        <div className={styles.weekLabel}>
          <span className={styles.weekRange}>{navLabel}</span>
          {!isCurrentPeriod && !nurseMode && (
            <button className={styles.todayBtn} onClick={() => setBaseDate(new Date())}>今日</button>
          )}
        </div>
        <button className={styles.navBtn} onClick={next} disabled={nurseMode} aria-label="次へ">›</button>
        {!nurseMode && (
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'month' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('month')}>月</button>
            <button className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('week')}>週</button>
          </div>
        )}
      </div>

      {/* ── 看護師モード：シフト凡例 ── */}
      {nurseMode && (
        <div className={styles.nurseLegend}>
          {SHIFT_TYPES.map(s => (
            <span key={s} className={styles.nurseLegendItem}>
              <span className={styles.nurseLegendDot} style={{ background: SHIFT_COLORS[s] }} />
              {s}
            </span>
          ))}
          <span className={styles.nurseLegendHint}>日付をタップして切り替え</span>
        </div>
      )}

      {/* ── 通常モード：メンバー凡例（タップでフィルタ） ── */}
      {!nurseMode && members.length > 0 && (
        <div className={styles.legend}>
          {members.map((m, i) => {
            const isActive = selectedMemberIds.length === 0 || selectedMemberIds.includes(m.id)
            return (
              <button
                key={m.id}
                className={`${styles.legendItem} ${!isActive ? styles.legendItemDimmed : ''}`}
                onClick={() => toggleMember(m.id)}
                aria-pressed={isActive}
              >
                <span className={styles.legendDot} style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }} />
                {m.name}
              </button>
            )
          })}
          {selectedMemberIds.length > 0 && (
            <button className={styles.legendResetBtn} onClick={() => setSelectedMemberIds([])}>
              全員
            </button>
          )}
        </div>
      )}

      {/* ── カレンダー本体 ── */}
      <main className={`${styles.main} ${viewMode === 'week' ? styles.mainWeekView : ''}`}>
        {loading ? (
          <p className={styles.hint}>読み込み中...</p>
        ) : viewMode === 'week' ? (
          <WeekTimeGrid
            weekDates={weekDates}
            filteredEvents={filteredEvents}
            memberColorMap={memberColorMap}
            todayStr={todayStr}
            onEventClick={ev => setEditTarget(ev)}
            onEdit={handleEdit}
            onSlotClick={dt => {
              setAddDefaultDate(toDateStr(dt))
              setAddDefaultStartDt(dt.toISOString().slice(0, 16))
              setShowAdd(true)
            }}
          />
        ) : (
          /* 月表示 */
          <MonthView
            grid={monthGrid}
            events={filteredEvents}
            memberColorMap={memberColorMap}
            baseDate={baseDate}
            todayStr={todayStr}
            onDayClick={nurseMode ? handleNurseDayTap : dateStr => { setAddDefaultDate(dateStr); setShowAdd(true) }}
            onEventClick={nurseMode ? null : ev => setEditTarget(ev)}
            nurseMode={nurseMode}
            shiftDraft={shiftDraft}
          />
        )}
      </main>

      {/* ── 看護師モード：一括登録バー ── */}
      {nurseMode && (
        <div className={styles.nurseBar}>
          <span className={styles.nurseBarCount}>
            {Object.keys(shiftDraft).length > 0
              ? `${Object.keys(shiftDraft).length}日入力中`
              : '日付をタップしてシフトを入力'}
          </span>
          <div className={styles.nurseBarBtns}>
            <button className={styles.nurseCancelBtn} onClick={cancelNurseMode}>キャンセル</button>
            <button
              className={styles.nurseSaveBtn}
              onClick={handleSaveShifts}
              disabled={nurseSaving || Object.keys(shiftDraft).length === 0}
            >
              {nurseSaving ? '保存中...' : '登録'}
            </button>
          </div>
        </div>
      )}

      {/* ── モーダル ── */}
      {showAdd && (
        <EventModal
          mode="add"
          members={members}
          memberColorMap={memberColorMap}
          defaultDate={addDefaultDate}
          defaultStartDt={addDefaultStartDt}
          defaultMemberId={familyMember?.id}
          onSubmit={async data => { await handleAdd(data); setShowAdd(false); setAddDefaultStartDt(null) }}
          onClose={() => { setShowAdd(false); setAddDefaultStartDt(null) }}
        />
      )}
      {editTarget && (
        <EventModal
          mode="edit"
          event={editTarget}
          members={members}
          memberColorMap={memberColorMap}
          onSubmit={async data => { await handleEdit(editTarget.id, data); setEditTarget(null) }}
          onDelete={async () => { await handleDelete(editTarget.id); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ── 月表示コンポーネント ──────────────────────────────────────

const MAX_CHIPS = 2

function MonthView({ grid, events, memberColorMap, baseDate, todayStr, onDayClick, onEventClick, nurseMode, shiftDraft }) {
  const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']
  const currentMonth = baseDate.getMonth()
  const currentYear = baseDate.getFullYear()

  return (
    <div className={styles.monthWrapper}>
      <div className={styles.monthDayLabels}>
        {DAY_LABELS.map((label, i) => (
          <div key={label} className={`${styles.monthDayLabel} ${i === 5 ? styles.sat : ''} ${i === 6 ? styles.sun : ''}`}>
            {label}
          </div>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {grid.map((date, idx) => {
          const dateStr = toDateStr(date)
          const isToday = dateStr === todayStr
          const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
          const isSat = idx % 7 === 5
          const isSun = idx % 7 === 6

          // 看護師モード
          if (nurseMode) {
            const draftShift = shiftDraft[dateStr] ?? null
            return (
              <div
                key={dateStr}
                className={`${styles.monthCell} ${styles.monthCellNurse} ${isToday ? styles.monthCellToday : ''} ${!isCurrentMonth ? styles.monthCellOtherMonth : ''}`}
                style={draftShift ? { '--shift-color': SHIFT_COLORS[draftShift] } : {}}
                onClick={() => onDayClick(dateStr)}
              >
                <span className={`${styles.monthDateNum} ${isToday ? styles.monthDateNumToday : ''} ${isSat ? styles.sat : ''} ${isSun ? styles.sun : ''} ${!isCurrentMonth ? styles.otherMonth : ''}`}>
                  {date.getDate()}
                </span>
                {draftShift && (
                  <div className={styles.nurseShiftBadge}>
                    {draftShift}
                  </div>
                )}
              </div>
            )
          }

          // 通常モード
          const dayShifts = events.filter(e => e.shift_type && isEventOnDay(e, date))
          const dayEvents = events
            .filter(e => !e.shift_type && isEventOnDay(e, date))
            .sort((a, b) => {
              if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
              const aTime = a.all_day ? a.start_date : a.start_datetime
              const bTime = b.all_day ? b.start_date : b.start_datetime
              return aTime < bTime ? -1 : 1
            })
          const visibleEvents = dayEvents.slice(0, MAX_CHIPS)
          const overflow = dayEvents.length - MAX_CHIPS

          return (
            <div
              key={dateStr}
              className={`${styles.monthCell} ${isToday ? styles.monthCellToday : ''} ${!isCurrentMonth ? styles.monthCellOtherMonth : ''}`}
              onClick={() => onDayClick(dateStr)}
            >
              <span className={`${styles.monthDateNum} ${isToday ? styles.monthDateNumToday : ''} ${isSat ? styles.sat : ''} ${isSun ? styles.sun : ''} ${!isCurrentMonth ? styles.otherMonth : ''}`}>
                {date.getDate()}
              </span>
              <div className={styles.monthEventList}>
                {visibleEvents.map(ev => (
                  <EventChip key={ev.id} event={ev} color={ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'} compact onClick={e => { e.stopPropagation(); onEventClick?.(ev) }} />
                ))}
                {overflow > 0 && <span className={styles.monthOverflow}>+{overflow}件</span>}
              </div>
              {dayShifts.length > 0 && (
                <div className={styles.monthShiftList}>
                  {dayShifts.map(ev => (
                    <ShiftBlock key={ev.id} shiftType={ev.shift_type} compact onClick={e => { e.stopPropagation(); onEventClick?.(ev) }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 週タイムグリッド 定数 ─────────────────────────────────────

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

function WeekTimeGrid({ weekDates, filteredEvents, memberColorMap, todayStr, onEventClick, onEdit, onSlotClick }) {
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
          return (
            <div key={ds} className={`${styles.weekDayHead} ${isToday ? styles.weekDayHeadToday : ''}`}>
              <span className={`${styles.dayLabel} ${isSat ? styles.sat : ''} ${isSun ? styles.sun : ''}`}>{WLABELS[idx]}</span>
              <span className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ''} ${isSat ? styles.sat : ''} ${isSun ? styles.sun : ''}`}>{date.getDate()}</span>
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
                : <EventChip key={ev.id} event={ev} color={ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'} compact onClick={e => { e.stopPropagation(); onEventClick(ev) }} />
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
                const color = ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'

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
                    <span className={styles.timedEventTitle}>{ev.title}</span>
                    {height > 34 && (
                      <span className={styles.timedEventTime}>
                        {formatTime(ev.start_datetime)}–{formatTime(ev.end_datetime)}
                      </span>
                    )}
                    <div
                      className={styles.resizeHandle}
                      onMouseDown={e => { e.stopPropagation(); onDragStart(e, ev, 'resize') }}
                      onTouchStart={e => { e.stopPropagation(); onDragStart(e, ev, 'resize') }}
                    />
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

function ShiftBlock({ shiftType, compact = false, onClick }) {
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

function EventChip({ event, color, showTime = false, compact = false, onClick }) {
  return (
    <button
      className={`${styles.eventChip} ${compact ? styles.eventChipCompact : ''}`}
      style={{ '--chip-color': color }}
      onClick={onClick}
      title={event.title}
    >
      {showTime && <span className={styles.eventTime}>{formatTime(event.start_datetime)}</span>}
      <span className={styles.eventTitle}>{event.title}</span>
      {!compact && event.member?.name && <span className={styles.eventMember}>{event.member.name}</span>}
    </button>
  )
}

// ── イベント追加・編集モーダル ────────────────────────────────

function EventModal({ mode, event, members, memberColorMap, defaultDate, defaultStartDt, defaultMemberId, onSubmit, onDelete, onClose }) {
  const today = toDateStr(new Date())
  const nowRound = (() => {
    const d = new Date()
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0)
    return d.toISOString().slice(0, 16)
  })()

  const [title, setTitle] = useState(event?.title ?? '')
  const [memo, setMemo] = useState(event?.memo ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? (defaultStartDt ? false : true))
  const [startDate, setStartDate] = useState(event?.start_date ?? defaultDate ?? today)
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [startDt, setStartDt] = useState(
    event?.start_datetime
      ? new Date(event.start_datetime).toISOString().slice(0, 16)
      : defaultStartDt ?? nowRound
  )
  const [endDt, setEndDt] = useState(
    event?.end_datetime
      ? new Date(event.end_datetime).toISOString().slice(0, 16)
      : (() => {
          const base = new Date(defaultStartDt ?? nowRound)
          base.setHours(base.getHours() + 1)
          return base.toISOString().slice(0, 16)
        })()
  )
  const [memberId, setMemberId] = useState(event?.member_id ?? defaultMemberId ?? '')
  const [submitting, setSubmitting] = useState(false)

  const [history, setHistory] = useState([])
  useEffect(() => {
    if (mode !== 'edit' || !event?.id) return
    supabase
      .from('schedule_event_history')
      .select('id, action, changed_by_name, changed_at')
      .eq('event_id', event.id)
      .order('changed_at', { ascending: false })
      .then(({ data }) => { if (data) setHistory(data) })
  }, [mode, event?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    await onSubmit({
      title: title.trim(),
      memo: memo.trim() || null,
      all_day: allDay,
      member_id: memberId || null,
      shift_type: null,
      ...(allDay
        ? { start_date: startDate, end_date: endDate || null, start_datetime: null, end_datetime: null }
        : { start_date: null, end_date: null, start_datetime: new Date(startDt).toISOString(), end_datetime: new Date(endDt).toISOString() }
      ),
    })
    setSubmitting(false)
  }

  const isEdit = mode === 'edit'

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? '予定を編集' : '予定を追加'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.fieldLabel}>
            タイトル
            <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 家族でお出かけ、歯医者..." maxLength={100} autoFocus required />
          </label>
          <div className={styles.fieldLabel}>
            種類
            <div className={styles.toggleRow}>
              <button type="button" className={`${styles.toggleBtn} ${allDay ? styles.toggleActive : ''}`} onClick={() => setAllDay(true)}>終日</button>
              <button type="button" className={`${styles.toggleBtn} ${!allDay ? styles.toggleActive : ''}`} onClick={() => setAllDay(false)}>時間指定</button>
            </div>
          </div>
          {allDay ? (
            <>
              <label className={styles.fieldLabel}>開始日<input className={styles.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label>
              <label className={styles.fieldLabel}>終了日（任意・複数日の場合）<input className={styles.input} type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></label>
            </>
          ) : (
            <>
              <label className={styles.fieldLabel}>開始<input className={styles.input} type="datetime-local" value={startDt} onChange={e => setStartDt(e.target.value)} required /></label>
              <label className={styles.fieldLabel}>終了<input className={styles.input} type="datetime-local" value={endDt} min={startDt} onChange={e => setEndDt(e.target.value)} required /></label>
            </>
          )}
          {members.length > 0 && (
            <div className={styles.fieldLabel}>
              誰の予定？
              <div className={styles.memberSelect}>
                <button type="button" className={`${styles.memberOption} ${!memberId ? styles.memberOptionActive : ''}`} style={!memberId ? { '--active-color': 'var(--primary)' } : {}} onClick={() => setMemberId('')}>
                  <span className={styles.memberDot} style={{ background: 'var(--gray-300)' }} />家族全員
                </button>
                {members.map((m, i) => {
                  const color = MEMBER_COLORS[i % MEMBER_COLORS.length]
                  return (
                    <button key={m.id} type="button" className={`${styles.memberOption} ${memberId === m.id ? styles.memberOptionActive : ''}`} style={memberId === m.id ? { '--active-color': color } : {}} onClick={() => setMemberId(m.id)}>
                      <span className={styles.memberDot} style={{ background: color }} />{m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <label className={styles.fieldLabel}>メモ（任意）<input className={styles.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="詳細・場所など..." maxLength={200} /></label>
          <div className={styles.formBtns}>
            {isEdit && <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !title.trim()}>{submitting ? '保存中...' : isEdit ? '保存' : '追加'}</button>
          </div>
        </form>
        {isEdit && history.length > 0 && (
          <div className={styles.historySection}>
            <p className={styles.historySectionTitle}>変更履歴</p>
            <ul className={styles.historyList}>
              {history.map(h => (
                <li key={h.id} className={styles.historyItem}>
                  <span className={`${styles.historyAction} ${h.action === 'created' ? styles.historyActionCreated : styles.historyActionUpdated}`}>
                    {h.action === 'created' ? '作成' : '更新'}
                  </span>
                  <span className={styles.historyDate}>
                    {new Date(h.changed_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {h.changed_by_name && (
                    <span className={styles.historyBy}>{h.changed_by_name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
