import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import styles from './SchedulePage.module.css'

const MEMBER_COLORS = [
  '#8E81B5',
  '#C2826A',
  '#5A9E82',
  '#C49A5A',
  '#6B9EC2',
  '#C26B8E',
  '#6BC2B4',
  '#9E6BC2',
]

// ── 日付ユーティリティ ────────────────────────────────────────

function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
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
  const startOffset = (firstDay.getDay() + 6) % 7 // 月曜起点
  const gridStart = new Date(firstDay)
  gridStart.setDate(1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    return date
  })
}

// ── メインコンポーネント ────────────────────────────────────

export default function SchedulePage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('month') // 'week' | 'month'
  const [baseDate, setBaseDate] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [addDefaultDate, setAddDefaultDate] = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate])
  const monthGrid = useMemo(() => getMonthGrid(baseDate), [baseDate])

  const fetchAll = useCallback(async () => {
    if (!familyMember?.family_id) return
    const fid = familyMember.family_id
    const [{ data: ev }, { data: mem }] = await Promise.all([
      supabase
        .from('schedule_events')
        .select('*, member:family_members!schedule_events_member_id_fkey(id, name)')
        .eq('family_id', fid)
        .order('start_datetime', { ascending: true, nullsFirst: false })
        .order('start_date', { ascending: true }),
      supabase
        .from('family_members')
        .select('id, name')
        .eq('family_id', fid),
    ])
    if (ev) setEvents(ev)
    if (mem) setMembers(mem)
    setLoading(false)
  }, [familyMember?.family_id])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const ch = supabase
      .channel('schedule_events_rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_events',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [familyMember?.family_id, fetchAll])

  const memberColorMap = useMemo(() => {
    const map = {}
    members.forEach((m, i) => { map[m.id] = MEMBER_COLORS[i % MEMBER_COLORS.length] })
    return map
  }, [members])

  async function handleAdd(data) {
    await supabase.from('schedule_events').insert({ family_id: familyMember.family_id, ...data })
    await fetchAll()
  }

  async function handleEdit(id, data) {
    await supabase.from('schedule_events').update(data).eq('id', id)
    await fetchAll()
  }

  async function handleDelete(id) {
    await supabase.from('schedule_events').delete().eq('id', id)
    await fetchAll()
  }

  // ── ナビゲーション ──────────────────────────────────────────
  function prev() {
    const d = new Date(baseDate)
    if (viewMode === 'week') { d.setDate(d.getDate() - 7) }
    else { d.setDate(1); d.setMonth(d.getMonth() - 1) }
    setBaseDate(d)
  }
  function next() {
    const d = new Date(baseDate)
    if (viewMode === 'week') { d.setDate(d.getDate() + 7) }
    else { d.setDate(1); d.setMonth(d.getMonth() + 1) }
    setBaseDate(d)
  }
  function goToday() { setBaseDate(new Date()) }

  const todayStr = toDateStr(new Date())
  const isCurrentPeriod = viewMode === 'week'
    ? weekDates.some(d => toDateStr(d) === todayStr)
    : baseDate.getFullYear() === new Date().getFullYear() && baseDate.getMonth() === new Date().getMonth()

  // 週ビュー用データ
  const eventsByDay = useMemo(() => {
    return weekDates.map(date => ({
      date,
      allDayEvents: events.filter(e => e.all_day && isEventOnDay(e, date)),
      timedEvents: events
        .filter(e => !e.all_day && isEventOnDay(e, date))
        .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime)),
    }))
  }, [events, weekDates])

  // ナビラベル
  const navLabel = viewMode === 'week'
    ? `${weekDates[0].toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜 ${weekDates[6].toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}`
    : `${baseDate.getFullYear()}年${baseDate.getMonth() + 1}月`

  const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

  return (
    <div className={styles.page}>
      {/* ── ヘッダー ── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る">
          <BsHouseFill />
        </button>
        <h1 className={styles.headerTitle}>📅 スケジュール</h1>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${viewMode === 'month' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('month')}
          >月</button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('week')}
          >週</button>
        </div>
        <button className={styles.addHeaderBtn} onClick={() => { setAddDefaultDate(null); setShowAdd(true) }}>
          ＋
        </button>
      </header>

      {/* ── ナビゲーション ── */}
      <div className={styles.weekNav}>
        <button className={styles.navBtn} onClick={prev} aria-label="前へ">‹</button>
        <div className={styles.weekLabel}>
          <span className={styles.weekRange}>{navLabel}</span>
          {!isCurrentPeriod && (
            <button className={styles.todayBtn} onClick={goToday}>今日</button>
          )}
        </div>
        <button className={styles.navBtn} onClick={next} aria-label="次へ">›</button>
      </div>

      {/* ── メンバー凡例 ── */}
      {members.length > 0 && (
        <div className={styles.legend}>
          {members.map((m, i) => (
            <span key={m.id} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }} />
              {m.name}
            </span>
          ))}
        </div>
      )}

      {/* ── カレンダー本体 ── */}
      <main className={styles.main}>
        {loading ? (
          <p className={styles.hint}>読み込み中...</p>
        ) : viewMode === 'week' ? (
          /* ── 週表示 ── */
          <div className={styles.weekGrid}>
            {eventsByDay.map(({ date, allDayEvents, timedEvents }, idx) => {
              const dateStr = toDateStr(date)
              const isToday = dateStr === todayStr
              const isSat = idx === 5
              const isSun = idx === 6
              return (
                <div
                  key={dateStr}
                  className={`${styles.dayColumn} ${isToday ? styles.dayColumnToday : ''}`}
                  onClick={() => { setAddDefaultDate(dateStr); setShowAdd(true) }}
                >
                  <div className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ''}`}>
                    <span className={`${styles.dayLabel} ${isSat ? styles.sat : ''} ${isSun ? styles.sun : ''}`}>
                      {DAY_LABELS[idx]}
                    </span>
                    <span className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ''} ${isSat ? styles.sat : ''} ${isSun ? styles.sun : ''}`}>
                      {date.getDate()}
                    </span>
                  </div>
                  <div className={styles.allDayArea}>
                    {allDayEvents.map(ev => (
                      <EventChip
                        key={ev.id} event={ev}
                        color={ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'}
                        onClick={e => { e.stopPropagation(); setEditTarget(ev) }}
                      />
                    ))}
                  </div>
                  <div className={styles.timedArea}>
                    {timedEvents.map(ev => (
                      <EventChip
                        key={ev.id} event={ev}
                        color={ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'}
                        showTime
                        onClick={e => { e.stopPropagation(); setEditTarget(ev) }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── 月表示 ── */
          <MonthView
            grid={monthGrid}
            events={events}
            memberColorMap={memberColorMap}
            baseDate={baseDate}
            todayStr={todayStr}
            onDayClick={dateStr => { setAddDefaultDate(dateStr); setShowAdd(true) }}
            onEventClick={ev => setEditTarget(ev)}
          />
        )}
      </main>

      {showAdd && (
        <EventModal
          mode="add"
          members={members}
          memberColorMap={memberColorMap}
          defaultDate={addDefaultDate}
          defaultMemberId={familyMember?.id}
          onSubmit={async data => { await handleAdd(data); setShowAdd(false) }}
          onClose={() => setShowAdd(false)}
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
    </div>
  )
}

// ── 月表示コンポーネント ────────────────────────────────────

const MAX_CHIPS = 3

function MonthView({ grid, events, memberColorMap, baseDate, todayStr, onDayClick, onEventClick }) {
  const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']
  const currentMonth = baseDate.getMonth()
  const currentYear = baseDate.getFullYear()

  return (
    <div className={styles.monthWrapper}>
      {/* 曜日ヘッダー */}
      <div className={styles.monthDayLabels}>
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`${styles.monthDayLabel} ${i === 5 ? styles.sat : ''} ${i === 6 ? styles.sun : ''}`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 6行 × 7列グリッド */}
      <div className={styles.monthGrid}>
        {grid.map((date, idx) => {
          const dateStr = toDateStr(date)
          const isToday = dateStr === todayStr
          const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
          const isSat = idx % 7 === 5
          const isSun = idx % 7 === 6

          const dayEvents = events
            .filter(e => isEventOnDay(e, date))
            .sort((a, b) => {
              // 終日→時間指定の順、同種は時刻順
              if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
              const aTime = a.all_day ? a.start_date : a.start_datetime
              const bTime = b.all_day ? b.start_date : b.start_datetime
              return aTime < bTime ? -1 : 1
            })
          const visible = dayEvents.slice(0, MAX_CHIPS)
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
                {visible.map(ev => (
                  <EventChip
                    key={ev.id}
                    event={ev}
                    color={ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'}
                    showTime={!ev.all_day}
                    compact
                    onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                  />
                ))}
                {overflow > 0 && (
                  <span className={styles.monthOverflow}>+{overflow}件</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── イベントチップ ──────────────────────────────────────────

function EventChip({ event, color, showTime = false, compact = false, onClick }) {
  return (
    <button
      className={`${styles.eventChip} ${compact ? styles.eventChipCompact : ''}`}
      style={{ '--chip-color': color }}
      onClick={onClick}
      title={event.title}
    >
      {showTime && (
        <span className={styles.eventTime}>{formatTime(event.start_datetime)}</span>
      )}
      <span className={styles.eventTitle}>{event.title}</span>
      {!compact && event.member?.name && (
        <span className={styles.eventMember}>{event.member.name}</span>
      )}
    </button>
  )
}

// ── イベント追加・編集モーダル ──────────────────────────────

function EventModal({ mode, event, members, memberColorMap, defaultDate, defaultMemberId, onSubmit, onDelete, onClose }) {
  const today = toDateStr(new Date())
  const nowRound = (() => {
    const d = new Date()
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0)
    return d.toISOString().slice(0, 16)
  })()

  const [title, setTitle] = useState(event?.title ?? '')
  const [memo, setMemo] = useState(event?.memo ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? true)
  const [startDate, setStartDate] = useState(event?.start_date ?? defaultDate ?? today)
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [startDt, setStartDt] = useState(
    event?.start_datetime ? new Date(event.start_datetime).toISOString().slice(0, 16) : nowRound
  )
  const [endDt, setEndDt] = useState(
    event?.end_datetime
      ? new Date(event.end_datetime).toISOString().slice(0, 16)
      : (() => { const d = new Date(nowRound); d.setHours(d.getHours() + 1); return d.toISOString().slice(0, 16) })()
  )
  const [memberId, setMemberId] = useState(event?.member_id ?? defaultMemberId ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    await onSubmit({
      title: title.trim(),
      memo: memo.trim() || null,
      all_day: allDay,
      member_id: memberId || null,
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
            <input
              className={styles.input}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例: 家族でお出かけ、歯医者..."
              maxLength={100}
              autoFocus
              required
            />
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
              <label className={styles.fieldLabel}>
                開始日
                <input className={styles.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </label>
              <label className={styles.fieldLabel}>
                終了日（任意・複数日の場合）
                <input className={styles.input} type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className={styles.fieldLabel}>
                開始
                <input className={styles.input} type="datetime-local" value={startDt} onChange={e => setStartDt(e.target.value)} required />
              </label>
              <label className={styles.fieldLabel}>
                終了
                <input className={styles.input} type="datetime-local" value={endDt} min={startDt} onChange={e => setEndDt(e.target.value)} required />
              </label>
            </>
          )}

          {members.length > 0 && (
            <div className={styles.fieldLabel}>
              誰の予定？
              <div className={styles.memberSelect}>
                <button
                  type="button"
                  className={`${styles.memberOption} ${!memberId ? styles.memberOptionActive : ''}`}
                  style={!memberId ? { '--active-color': 'var(--primary)' } : {}}
                  onClick={() => setMemberId('')}
                >
                  <span className={styles.memberDot} style={{ background: 'var(--gray-300)' }} />
                  家族全員
                </button>
                {members.map((m, i) => {
                  const color = MEMBER_COLORS[i % MEMBER_COLORS.length]
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`${styles.memberOption} ${memberId === m.id ? styles.memberOptionActive : ''}`}
                      style={memberId === m.id ? { '--active-color': color } : {}}
                      onClick={() => setMemberId(m.id)}
                    >
                      <span className={styles.memberDot} style={{ background: color }} />
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <label className={styles.fieldLabel}>
            メモ（任意）
            <input
              className={styles.input}
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="詳細・場所など..."
              maxLength={200}
            />
          </label>

          <div className={styles.formBtns}>
            {isEdit && (
              <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>
            )}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !title.trim()}>
              {submitting ? '保存中...' : isEdit ? '保存' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
