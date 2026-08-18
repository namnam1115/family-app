import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { IconClose, IconSchedule, IconSearch, IconWork } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  MEMBER_COLORS,
  SHIFT_TYPES,
  SHIFT_COLORS,
  masterId,
  cycleShift,
  toDateStr,
  toLocalInput,
  isEventOnDay,
  getWeekDates,
  expandEvent,
  getMonthGrid,
} from '../lib/schedule'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import AgendaView from '../components/schedule/AgendaView'
import DayDetailModal from '../components/schedule/DayDetailModal'
import EventDetailModal from '../components/schedule/EventDetailModal'
import EventModal from '../components/schedule/EventModal'
import MonthPickerModal from '../components/schedule/MonthPickerModal'
import MonthView from '../components/schedule/MonthView'
import PollsModal from '../components/schedule/PollsModal'
import SearchModal from '../components/schedule/SearchModal'
import WeekTimeGrid from '../components/schedule/WeekTimeGrid'
import styles from '../components/schedule/Schedule.module.css'

export default function SchedulePage() {
  const { familyMember, user } = useAuth()
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
  const [detailTarget, setDetailTarget] = useState(null)   // 予定詳細ビュー（#6）
  const [dayDetail, setDayDetail] = useState(null)          // デイビュー対象日 dateStr（#1 #2）
  const [showMonthPicker, setShowMonthPicker] = useState(false) // 年月ジャンプ
  const [showPolls, setShowPolls] = useState(false)             // 日程調整
  const [showSearch, setShowSearch] = useState(false)           // 予定の検索

  // コメント未読バッジ用（#2）: { [eventId]: {count, latestAt, latestAuthor} } と既読時刻
  const [commentMeta, setCommentMeta] = useState({})
  const [reads, setReads] = useState({})

  // 看護師モード
  const [nurseMode, setNurseMode] = useState(false)
  const [shiftDraft, setShiftDraft] = useState({})   // { dateStr: shift_type }
  const [initialShifts, setInitialShifts] = useState({})
  const [nurseSaving, setNurseSaving] = useState(false)

  // メンバーフィルタ（空配列 = 全員表示）
  const [selectedMemberIds, setSelectedMemberIds] = useState([])

  // ヘッダーの「⋯」メニュー開閉
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)

  // 変更通知 ON/OFF（ユーザー毎）
  const [notifyOnChange, setNotifyOnChange] = useState(true)

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
    const select = '*, member:family_members!schedule_events_member_id_fkey(id, name)'

    // 単発イベント（範囲内）と繰り返しイベント（全件→クライアント展開）を並行取得
    const [normalRes, recurringRes] = await Promise.all([
      supabase
        .from('schedule_events')
        .select(select)
        .eq('family_id', familyMember.family_id)
        .or(orFilter)
        .or('recurrence.is.null,recurrence.eq.none')
        .order('start_datetime', { ascending: true, nullsFirst: false })
        .order('start_date', { ascending: true }),
      supabase
        .from('schedule_events')
        .select(select)
        .eq('family_id', familyMember.family_id)
        .not('recurrence', 'is', null)
        .neq('recurrence', 'none'),
    ])

    const normal = normalRes.data || []
    const expanded = (recurringRes.data || []).flatMap(e => expandEvent(e, start, end))
    setEvents([...normal, ...expanded])
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

  // ── 日程調整の候補日をカレンダーに薄く表示 ────────────────
  const [pollDates, setPollDates] = useState({})   // { dateStr: [poll title, ...] }
  const fetchPollDates = useCallback(async () => {
    if (!familyMember?.family_id) { setPollDates({}); return }
    const { data } = await supabase
      .from('schedule_polls')
      .select('title, candidates:schedule_poll_candidates(candidate_date)')
      .eq('family_id', familyMember.family_id)
      .eq('status', 'open')
    const map = {}
    for (const p of data || []) {
      for (const c of p.candidates || []) {
        (map[c.candidate_date] ||= []).push(p.title)
      }
    }
    setPollDates(map)
  }, [familyMember?.family_id])

  useEffect(() => { fetchPollDates() }, [fetchPollDates])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const ch = supabase
      .channel('schedule_polls_rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_polls',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, () => fetchPollDates())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [familyMember?.family_id, fetchPollDates])

  // 表示中イベントのマスターID一覧（未読集計を表示範囲に限定しスケールさせる）
  const visibleMasterIds = useMemo(
    () => [...new Set(events.map(masterId))],
    [events]
  )

  // ── コメント未読バッジ（#2） ──────────────────────────────
  const fetchCommentMeta = useCallback(async () => {
    if (!familyMember?.family_id || visibleMasterIds.length === 0) {
      setCommentMeta({}); setReads({}); return
    }
    const [{ data: comments }, { data: readRows }] = await Promise.all([
      supabase
        .from('schedule_event_comments')
        .select('event_id, created_at, member_id')
        .eq('family_id', familyMember.family_id)
        .in('event_id', visibleMasterIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('schedule_event_reads')
        .select('event_id, last_read_at')
        .eq('member_id', familyMember.id)
        .in('event_id', visibleMasterIds),
    ])
    const meta = {}
    for (const c of comments || []) {
      const m = meta[c.event_id] || { count: 0, latestAt: null, latestAuthor: null }
      m.count += 1
      m.latestAt = c.created_at
      m.latestAuthor = c.member_id
      meta[c.event_id] = m
    }
    setCommentMeta(meta)
    const r = {}
    for (const row of readRows || []) r[row.event_id] = row.last_read_at
    setReads(r)
  }, [familyMember?.family_id, familyMember?.id, visibleMasterIds])

  useEffect(() => { fetchCommentMeta() }, [fetchCommentMeta])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const ch = supabase
      .channel('schedule_comments_meta_rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_event_comments',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, () => fetchCommentMeta())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [familyMember?.family_id, fetchCommentMeta])

  // イベントID→未読フラグ（自分以外の新着コメントが既読時刻より後）
  const unreadMap = useMemo(() => {
    const map = {}
    for (const [eid, m] of Object.entries(commentMeta)) {
      const lastRead = reads[eid]
      map[eid] = m.latestAuthor && m.latestAuthor !== familyMember?.id &&
        (!lastRead || new Date(m.latestAt) > new Date(lastRead))
    }
    return map
  }, [commentMeta, reads, familyMember?.id])

  // 予定を開いたら既読にする
  const markRead = useCallback(async (eid) => {
    if (!familyMember?.family_id) return
    const now = new Date().toISOString()
    setReads(prev => ({ ...prev, [eid]: now }))
    await supabase.from('schedule_event_reads').upsert({
      event_id: eid, member_id: familyMember.id, family_id: familyMember.family_id, last_read_at: now,
    }, { onConflict: 'event_id,member_id' })
  }, [familyMember?.family_id, familyMember?.id])

  // ── 変更通知 ON/OFF ───────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('schedule_notify_prefs')
      .select('notify_on_change')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setNotifyOnChange(data.notify_on_change) })
  }, [user?.id])

  async function toggleNotify() {
    const next = !notifyOnChange
    setNotifyOnChange(next)
    await supabase.from('schedule_notify_prefs').upsert({
      user_id: user.id, family_id: familyMember.family_id, notify_on_change: next, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  // ── 家族への即時通知（#1） ────────────────────────────────
  const notifyFamily = useCallback((action, title, eventId) => {
    if (!familyMember?.family_id) return
    supabase.functions.invoke('notify-schedule-change', {
      body: {
        family_id: familyMember.family_id,
        actor_name: familyMember.name,
        actor_user_id: user?.id,
        action, title, event_id: eventId,
      },
    }).catch(() => {})   // 通知失敗は本処理をブロックしない
  }, [familyMember?.family_id, familyMember?.name, user?.id])

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
      notifyFamily('created', data.title, inserted.id)   // 家族へ即時通知（#1）
    }
    await fetchEvents()
  }
  async function handleEdit(id, data) {
    // 編集したらリマインダー送信済みフラグをリセットし再度通知対象にする（#4）
    await supabase.from('schedule_events').update({ ...data, reminder_sent_at: null }).eq('id', id)
    await supabase.from('schedule_event_history').insert({
      event_id: id,
      family_id: familyMember.family_id,
      changed_by: familyMember.id,
      changed_by_name: familyMember.name,
      action: 'updated',
      snapshot: data,
    })
    notifyFamily('updated', data.title, id)   // 家族へ即時通知（#1）
    await fetchEvents()
  }
  async function handleDelete(id) {
    await supabase.from('schedule_events').delete().eq('id', id)
    await fetchEvents()
  }

  // 繰り返し予定の「この回だけ削除」= 除外日を追加（#3）
  async function handleDeleteOccurrence(event) {
    const id = masterId(event)
    const occDate = event.all_day ? event.start_date : toDateStr(new Date(event.start_datetime))
    const nextExceptions = [...(event.recurrence_exceptions || []), occDate]
    await supabase.from('schedule_events').update({ recurrence_exceptions: nextExceptions }).eq('id', id)
    await fetchEvents()
  }

  // 繰り返し予定の「この回だけ変更」= 元の回を除外し、単発予定として切り出す（#3）
  async function handleEditOccurrence(occ, data) {
    const id = masterId(occ)
    const occDate = occ.all_day ? occ.start_date : toDateStr(new Date(occ.start_datetime))
    const nextExceptions = [...(occ.recurrence_exceptions || []), occDate]
    await supabase.from('schedule_events').update({ recurrence_exceptions: nextExceptions }).eq('id', id)
    const { data: inserted } = await supabase
      .from('schedule_events')
      .insert({
        family_id: familyMember.family_id,
        ...data,
        recurrence: 'none', recurrence_until: null, recurrence_exceptions: [], reminder_sent_at: null,
      })
      .select('id')
      .single()
    if (inserted?.id) notifyFamily('updated', data.title, inserted.id)
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

  // 予定を開く＝既読化＋詳細表示
  function openDetail(ev) {
    markRead(masterId(ev))
    setDetailTarget(ev)
  }

  // ── スワイプで前後移動（#7） ──────────────────────────────
  const touchStartRef = useRef(null)
  function onMainTouchStart(e) {
    if (viewMode === 'week' || nurseMode) return   // 週表示はドラッグ操作と競合するため除外
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }
  function onMainTouchEnd(e) {
    const s = touchStartRef.current
    if (!s) return
    touchStartRef.current = null
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next(); else prev()
    }
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
        <h1 className={styles.headerTitle}><IconSchedule className={styles.headerTitleIcon} /> スケジュール</h1>

        {nurseMode ? (
          /* 勤務入力モード中：終了ボタンを明示 */
          <button
            className={styles.nurseExitBtn}
            onClick={cancelNurseMode}
            aria-label="勤務入力モードを終了"
          >
            <span aria-hidden="true"><IconClose /></span> 勤務モード終了
          </button>
        ) : (
          <>
            {/* 予定の検索 */}
            <button className={styles.menuBtn} onClick={() => setShowSearch(true)} aria-label="予定を検索">
              <IconSearch />
            </button>

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
                      onClick={() => { setHeaderMenuOpen(false); setShowPolls(true) }}
                    >
                      <span className={styles.headerMenuIcon} aria-hidden="true">🗳️</span>
                      日程調整
                    </button>
                    <button
                      className={styles.headerMenuItem}
                      role="menuitem"
                      onClick={() => { setHeaderMenuOpen(false); enableNurseMode() }}
                    >
                      <span className={styles.headerMenuIcon} aria-hidden="true"><IconWork /></span>
                      勤務入力モード
                    </button>
                    <button
                      className={styles.headerMenuItem}
                      role="menuitemcheckbox"
                      aria-checked={notifyOnChange}
                      onClick={() => { toggleNotify() }}
                    >
                      <span className={styles.headerMenuIcon} aria-hidden="true">{notifyOnChange ? '🔔' : '🔕'}</span>
                      変更通知 {notifyOnChange ? 'ON' : 'OFF'}
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
          <button
            className={styles.weekRangeBtn}
            onClick={() => { if (!nurseMode) setShowMonthPicker(true) }}
            disabled={nurseMode}
          >
            {navLabel}{!nurseMode && <span className={styles.weekRangeCaret} aria-hidden="true">▾</span>}
          </button>
          {!isCurrentPeriod && !nurseMode && (
            <button className={styles.todayBtn} onClick={() => setBaseDate(new Date())}>今日</button>
          )}
        </div>
        <button className={styles.navBtn} onClick={next} disabled={nurseMode} aria-label="次へ">›</button>
        {!nurseMode && (
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'month' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('month')}>月</button>
            <button className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('week')}>週</button>
            <button className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('list')}>リスト</button>
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
      <main
        className={`${styles.main} ${viewMode === 'week' ? styles.mainWeekView : ''}`}
        onTouchStart={onMainTouchStart}
        onTouchEnd={onMainTouchEnd}
      >
        {loading ? (
          <LoadingSpinner inline />
        ) : viewMode === 'week' ? (
          <WeekTimeGrid
            weekDates={weekDates}
            filteredEvents={filteredEvents}
            memberColorMap={memberColorMap}
            todayStr={todayStr}
            unreadMap={unreadMap}
            onEventClick={openDetail}
            onEdit={handleEdit}
            onSlotClick={dt => {
              setAddDefaultDate(toDateStr(dt))
              setAddDefaultStartDt(toLocalInput(dt))
              setShowAdd(true)
            }}
          />
        ) : viewMode === 'list' ? (
          /* アジェンダ（リスト）表示（#8） */
          <AgendaView
            events={filteredEvents}
            memberColorMap={memberColorMap}
            baseDate={baseDate}
            todayStr={todayStr}
            unreadMap={unreadMap}
            onEventClick={openDetail}
          />
        ) : (
          /* 月表示 */
          <MonthView
            grid={monthGrid}
            events={filteredEvents}
            memberColorMap={memberColorMap}
            baseDate={baseDate}
            todayStr={todayStr}
            unreadMap={unreadMap}
            pollDates={pollDates}
            onPollClick={() => setShowPolls(true)}
            onDayClick={nurseMode ? handleNurseDayTap : dateStr => setDayDetail(dateStr)}
            onEventClick={nurseMode ? null : openDetail}
            onOverflowClick={dateStr => setDayDetail(dateStr)}
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
          familyId={familyMember?.family_id}
          defaultDate={addDefaultDate}
          defaultStartDt={addDefaultStartDt}
          defaultMemberId={familyMember?.id}
          onSubmit={async data => { await handleAdd(data); setShowAdd(false); setAddDefaultStartDt(null) }}
          onSubmitContinue={async data => { await handleAdd(data) }}
          onClose={() => { setShowAdd(false); setAddDefaultStartDt(null) }}
        />
      )}
      {editTarget && (
        <EventModal
          mode="edit"
          event={editTarget}
          members={members}
          memberColorMap={memberColorMap}
          familyId={familyMember?.family_id}
          onSubmit={async (data, scope) => {
            if (editTarget.is_occurrence && scope === 'single') await handleEditOccurrence(editTarget, data)
            else await handleEdit(masterId(editTarget), data)
            setEditTarget(null)
          }}
          onDelete={async () => { await handleDelete(masterId(editTarget)); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── デイビュー（その日の全予定 #1 #2） ── */}
      {dayDetail && (
        <DayDetailModal
          dateStr={dayDetail}
          events={filteredEvents}
          memberColorMap={memberColorMap}
          unreadMap={unreadMap}
          onEventClick={ev => { setDayDetail(null); openDetail(ev) }}
          onAdd={() => { setAddDefaultDate(dayDetail); setDayDetail(null); setShowAdd(true) }}
          onClose={() => setDayDetail(null)}
        />
      )}

      {/* ── 予定詳細ビュー（#5 #6 #9） ── */}
      {detailTarget && (
        <EventDetailModal
          event={detailTarget}
          familyMember={familyMember}
          memberColorMap={memberColorMap}
          onNotifyComment={title => notifyFamily('commented', title, masterId(detailTarget))}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null) }}
          onDelete={async () => { await handleDelete(masterId(detailTarget)); setDetailTarget(null) }}
          onDeleteOccurrence={async () => { await handleDeleteOccurrence(detailTarget); setDetailTarget(null) }}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* ── 年月ジャンプ ── */}
      {showMonthPicker && (
        <MonthPickerModal
          baseDate={baseDate}
          onSelect={(y, m) => { setBaseDate(new Date(y, m, 1)); setShowMonthPicker(false) }}
          onClose={() => setShowMonthPicker(false)}
        />
      )}

      {/* ── 予定の検索 ── */}
      {showSearch && (
        <SearchModal
          familyMember={familyMember}
          memberColorMap={memberColorMap}
          onSelect={ev => {
            setShowSearch(false)
            const base = ev.all_day ? ev.start_date : toDateStr(new Date(ev.start_datetime))
            setBaseDate(new Date(`${base}T00:00:00`))
            openDetail(ev)
          }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* ── 日程調整（出欠調整） ── */}
      {showPolls && (
        <PollsModal
          familyMember={familyMember}
          onRefetch={fetchEvents}
          onNotify={notifyFamily}
          onClose={() => { setShowPolls(false); fetchPollDates() }}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ── 月表示コンポーネント ──────────────────────────────────────

// セル内の高さ配分（CSS と揃える）。件数可変計算に使用（#6）
