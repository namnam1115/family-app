import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { IconSchedule, IconClose, IconWork, IconSearch } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { getHoliday } from '../lib/holidays'
import { useAuth } from '../contexts/AuthContext'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
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

// 予定カテゴリ（色分け #10）
const CATEGORIES = [
  { key: '仕事', color: '#6B9EC2' },
  { key: '学校', color: '#5A9E82' },
  { key: '病院', color: '#C26B8E' },
  { key: '家事', color: '#C49A5A' },
  { key: '行事', color: '#9E6BC2' },
  { key: '遊び', color: '#C2826A' },
]
const CATEGORY_COLORS = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]))

// リマインダー選択肢（#4）
const REMINDER_OPTIONS = [
  { value: '', label: 'なし' },
  { value: '10', label: '10分前' },
  { value: '30', label: '30分前' },
  { value: '60', label: '1時間前' },
  { value: '1440', label: '1日前' },
]
// 終日予定は当日朝（JST 9:00）を基準に通知
const ALLDAY_REMINDER_OPTIONS = [
  { value: '', label: 'なし' },
  { value: '0', label: '当日の朝' },
  { value: '1440', label: '前日の朝' },
  { value: '2880', label: '2日前の朝' },
]

// 繰り返し選択肢（#3）
const RECURRENCE_OPTIONS = [
  { value: 'none', label: '繰り返さない' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'monthly', label: '毎月' },
  { value: 'yearly', label: '毎年' },
]
const RECURRENCE_LABELS = Object.fromEntries(RECURRENCE_OPTIONS.map(o => [o.value, o.label]))

// 予定へのアイコン反応（スタンプ）。⭕=OK / ❌=NG を中心に出欠調整にも使える
const REACTIONS = [
  { emoji: '⭕', label: 'OK' },
  { emoji: '❌', label: 'NG' },
  { emoji: '🤔', label: '未定' },
  { emoji: '👍', label: 'いいね' },
  { emoji: '🙏', label: 'たのむ' },
  { emoji: '🎉', label: 'やった' },
]
const REACTION_LABELS = Object.fromEntries(REACTIONS.map(r => [r.emoji, r.label]))

// 色決定：カテゴリ優先 → メンバー色 → 既定（#10）
function eventColor(event, memberColorMap) {
  if (event.category && CATEGORY_COLORS[event.category]) return CATEGORY_COLORS[event.category]
  if (event.member_id && memberColorMap[event.member_id]) return memberColorMap[event.member_id]
  return '#8E81B5'
}

// 繰り返し予定・オカレンスの元IDを取得（DB操作はマスターに対して行う）
function masterId(event) {
  return event.master_id ?? event.id
}

// Esc キーでモーダルを閉じる（アクセシビリティ）
function useEscapeKey(onClose) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
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

// datetime-local 入力用にローカル時刻の 'YYYY-MM-DDTHH:mm' を返す。
// toISOString() は UTC に変換され時刻がズレるため使わない。
function toLocalInput(date) {
  const d = new Date(date)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
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

function addByRule(date, rule, n) {
  const d = new Date(date)
  if (rule === 'daily') { d.setDate(d.getDate() + n) }
  else if (rule === 'weekly') { d.setDate(d.getDate() + 7 * n) }
  else if (rule === 'monthly' || rule === 'yearly') {
    // 月末日（例: 31日・2/29）の桁上がりを防ぐため、対象月の末日にクランプする
    const day = d.getDate()
    d.setDate(1)
    if (rule === 'monthly') d.setMonth(d.getMonth() + n)
    else d.setFullYear(d.getFullYear() + n)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDay))
  }
  return d
}

// 繰り返し予定を表示範囲内のオカレンス群に展開する（#3）
// 単発イベントはそのまま [event] を返す。
function expandEvent(event, rangeStartStr, rangeEndStr) {
  if (!event.recurrence || event.recurrence === 'none') return [event]

  const isTimed = !event.all_day
  const until = event.recurrence_until || null
  const baseStart = isTimed ? new Date(event.start_datetime) : new Date(`${event.start_date}T00:00:00`)
  const durMs = isTimed ? (new Date(event.end_datetime) - new Date(event.start_datetime)) : 0
  const durDays = isTimed ? 0
    : Math.round((new Date(event.end_date || event.start_date) - new Date(event.start_date)) / 86400000)

  const exceptions = new Set(event.recurrence_exceptions || [])
  const out = []
  for (let n = 0; n < 800; n++) {
    const occStart = addByRule(baseStart, event.recurrence, n)
    const occStartStr = toDateStr(occStart)
    if (occStartStr > rangeEndStr) break
    if (until && occStartStr > until) break
    if (exceptions.has(occStartStr)) continue   // 「この回だけ削除」された日はスキップ

    let occEndStr
    if (isTimed) {
      occEndStr = toDateStr(new Date(occStart.getTime() + durMs))
    } else {
      const ed = new Date(occStart); ed.setDate(ed.getDate() + durDays); occEndStr = toDateStr(ed)
    }
    if (occEndStr < rangeStartStr) continue

    const base = { ...event, id: `${event.id}::${occStartStr}`, master_id: event.id, is_occurrence: true }
    if (isTimed) {
      out.push({
        ...base,
        start_datetime: occStart.toISOString(),
        end_datetime: new Date(occStart.getTime() + durMs).toISOString(),
      })
    } else {
      const ed = new Date(occStart); ed.setDate(ed.getDate() + durDays)
      out.push({ ...base, start_date: occStartStr, end_date: event.end_date ? toDateStr(ed) : null })
    }
  }
  return out
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

function MonthView({ grid, events, memberColorMap, baseDate, todayStr, unreadMap = {}, pollDates = {}, onPollClick, onDayClick, onEventClick, onOverflowClick, nurseMode, shiftDraft }) {
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

function WeekTimeGrid({ weekDates, filteredEvents, memberColorMap, todayStr, unreadMap = {}, onEventClick, onEdit, onSlotClick }) {
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

function EventChip({ event, color, showTime = false, compact = false, unread = false, onClick }) {
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

function EventModal({ mode, event, members, memberColorMap, familyId, defaultDate, defaultStartDt, defaultMemberId, onSubmit, onSubmitContinue, onDelete, onClose }) {
  useEscapeKey(onClose)
  const today = toDateStr(new Date())
  const nowRound = (() => {
    const d = new Date()
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0)
    return toLocalInput(d)
  })()

  const [title, setTitle] = useState(event?.title ?? '')
  const [memo, setMemo] = useState(event?.memo ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? (defaultStartDt ? false : true))
  const [startDate, setStartDate] = useState(event?.start_date ?? defaultDate ?? today)
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [startDt, setStartDt] = useState(
    event?.start_datetime
      ? toLocalInput(event.start_datetime)
      : defaultStartDt ?? nowRound
  )
  const [endDt, setEndDt] = useState(
    event?.end_datetime
      ? toLocalInput(event.end_datetime)
      : (() => {
          const base = new Date(defaultStartDt ?? nowRound)
          base.setHours(base.getHours() + 1)
          return toLocalInput(base)
        })()
  )
  const [memberId, setMemberId] = useState(event?.member_id ?? defaultMemberId ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [category, setCategory] = useState(event?.category ?? '')
  const [recurrence, setRecurrence] = useState(event?.recurrence ?? 'none')
  const [recurrenceUntil, setRecurrenceUntil] = useState(event?.recurrence_until ?? '')
  const [reminderMinutes, setReminderMinutes] = useState(
    event?.reminder_minutes != null ? String(event.reminder_minutes) : ''
  )
  const [submitting, setSubmitting] = useState(false)
  const [continueMode, setContinueMode] = useState(false)
  // 繰り返し予定の編集範囲（この回だけ / すべて）
  const [editScope, setEditScope] = useState('single')
  const titleRef = useRef(null)

  const [history, setHistory] = useState([])
  const histId = event ? masterId(event) : null
  useEffect(() => {
    if (mode !== 'edit' || !histId) return
    supabase
      .from('schedule_event_history')
      .select('id, action, changed_by_name, changed_at')
      .eq('event_id', histId)
      .order('changed_at', { ascending: false })
      .then(({ data }) => { if (data) setHistory(data) })
  }, [mode, histId])

  // タイトル履歴サジェスト（#7）: 家族の過去タイトルをよく使う順に
  const [titleSuggestions, setTitleSuggestions] = useState([])
  useEffect(() => {
    if (mode !== 'add' || !familyId) return
    supabase
      .from('schedule_events')
      .select('title')
      .eq('family_id', familyId)
      .is('shift_type', null)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!data) return
        const counts = {}
        for (const r of data) { if (r.title) counts[r.title] = (counts[r.title] || 0) + 1 }
        setTitleSuggestions(Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 20))
      })
  }, [mode, familyId])

  // 所要時間チップ（#7）: 終了を開始+分に設定
  function setDuration(min) {
    const base = new Date(startDt)
    if (isNaN(base)) return
    base.setMinutes(base.getMinutes() + min)
    setEndDt(toLocalInput(base))
  }

  function buildData() {
    return {
      title: title.trim(),
      memo: memo.trim() || null,
      all_day: allDay,
      member_id: memberId || null,
      shift_type: null,
      location: location.trim() || null,
      category: category || null,
      recurrence,
      recurrence_until: recurrence !== 'none' && recurrenceUntil ? recurrenceUntil : null,
      reminder_minutes: reminderMinutes ? Number(reminderMinutes) : null,
      ...(allDay
        ? { start_date: startDate, end_date: endDate || null, start_datetime: null, end_datetime: null }
        : { start_date: null, end_date: null, start_datetime: new Date(startDt).toISOString(), end_datetime: new Date(endDt).toISOString() }
      ),
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    const data = buildData()
    if (continueMode && !isEdit && onSubmitContinue) {
      // 続けて追加：モーダルを閉じずタイトルだけリセット
      await onSubmitContinue(data)
      setTitle(''); setMemo(''); setLocation('')
      setSubmitting(false)
      titleRef.current?.focus()
      return
    }
    // 「この回だけ変更」は単発予定として切り出すため繰り返しを解除
    if (isEdit && isOccurrence && editScope === 'single') {
      data.recurrence = 'none'; data.recurrence_until = null
    }
    await onSubmit(data, isOccurrence ? editScope : 'all')
    setSubmitting(false)
  }

  const isEdit = mode === 'edit'
  const isOccurrence = !!event?.is_occurrence

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? '予定を編集' : '予定を追加'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* 繰り返し予定の編集範囲（#3） */}
          {isEdit && isOccurrence && (
            <div className={styles.fieldLabel}>
              変更範囲
              <div className={styles.toggleRow}>
                <button type="button" className={`${styles.toggleBtn} ${editScope === 'single' ? styles.toggleActive : ''}`} onClick={() => setEditScope('single')}>この回だけ</button>
                <button type="button" className={`${styles.toggleBtn} ${editScope === 'all' ? styles.toggleActive : ''}`} onClick={() => setEditScope('all')}>すべて</button>
              </div>
            </div>
          )}
          <label className={styles.fieldLabel}>
            タイトル
            <input ref={titleRef} list="schedule-title-suggestions" className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 家族でお出かけ、歯医者..." maxLength={100} autoFocus required />
            {titleSuggestions.length > 0 && (
              <datalist id="schedule-title-suggestions">
                {titleSuggestions.map(t => <option key={t} value={t} />)}
              </datalist>
            )}
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
              <label className={styles.fieldLabel}>開始<input className={styles.input} type="datetime-local" value={startDt} onChange={e => {
                const v = e.target.value
                setStartDt(v)
                // 開始を動かしたら、終了が開始以前になった場合は開始+1時間へ自動追従
                if (v && endDt && endDt <= v) {
                  const base = new Date(v); base.setHours(base.getHours() + 1)
                  setEndDt(toLocalInput(base))
                }
              }} required /></label>
              <label className={styles.fieldLabel}>終了<input className={styles.input} type="datetime-local" value={endDt} min={startDt} onChange={e => setEndDt(e.target.value)} required /></label>
              <div className={styles.durationChips}>
                <span className={styles.durationLabel}>所要</span>
                <button type="button" className={styles.durationChip} onClick={() => setDuration(30)}>30分</button>
                <button type="button" className={styles.durationChip} onClick={() => setDuration(60)}>1時間</button>
                <button type="button" className={styles.durationChip} onClick={() => setDuration(120)}>2時間</button>
                <button type="button" className={styles.durationChip} onClick={() => setDuration(180)}>3時間</button>
              </div>
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
          {/* カテゴリ（#10） */}
          <div className={styles.fieldLabel}>
            カテゴリ（任意）
            <div className={styles.categorySelect}>
              <button type="button" className={`${styles.categoryChip} ${!category ? styles.categoryChipActive : ''}`} onClick={() => setCategory('')}>
                なし
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  className={`${styles.categoryChip} ${category === c.key ? styles.categoryChipActive : ''}`}
                  style={{ '--cat-color': c.color }}
                  onClick={() => setCategory(c.key)}
                >
                  <span className={styles.categoryDot} style={{ background: c.color }} />{c.key}
                </button>
              ))}
            </div>
          </div>

          {/* 繰り返し（#3） */}
          <label className={styles.fieldLabel}>
            繰り返し
            <select className={styles.input} value={recurrence} onChange={e => setRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {recurrence !== 'none' && (
            <label className={styles.fieldLabel}>
              繰り返し終了日（任意・空欄で無期限）
              <input className={styles.input} type="date" value={recurrenceUntil} min={allDay ? startDate : undefined} onChange={e => setRecurrenceUntil(e.target.value)} />
            </label>
          )}

          {/* リマインダー（#4・終日は当日朝基準） */}
          <label className={styles.fieldLabel}>
            リマインダー通知
            <select className={styles.input} value={reminderMinutes} onChange={e => setReminderMinutes(e.target.value)}>
              {(allDay ? ALLDAY_REMINDER_OPTIONS : REMINDER_OPTIONS).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          {/* 場所（#9） */}
          <label className={styles.fieldLabel}>場所（任意）<input className={styles.input} value={location} onChange={e => setLocation(e.target.value)} placeholder="例: 〇〇病院、東京駅..." maxLength={120} /></label>
          <label className={styles.fieldLabel}>メモ（任意）<input className={styles.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="詳細など..." maxLength={200} /></label>
          {!isEdit && (
            <label className={styles.continueToggle}>
              <input type="checkbox" checked={continueMode} onChange={e => setContinueMode(e.target.checked)} />
              続けて追加する（保存後に入力欄をリセット）
            </label>
          )}
          <div className={styles.formBtns}>
            {isEdit && <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>{continueMode && !isEdit ? '完了' : 'キャンセル'}</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !title.trim()}>{submitting ? '保存中...' : isEdit ? '保存' : continueMode ? '追加して次へ' : '追加'}</button>
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

// ── 表示ヘルパー ──────────────────────────────────────────────

function eventTimeLabel(ev) {
  if (ev.all_day) {
    if (ev.end_date && ev.end_date !== ev.start_date) {
      return `${ev.start_date} 〜 ${ev.end_date}`
    }
    return '終日'
  }
  return `${formatTime(ev.start_datetime)}–${formatTime(ev.end_datetime)}`
}

function mapsUrl(loc) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`
}

function reminderLabel(min, allDay) {
  const opts = allDay ? ALLDAY_REMINDER_OPTIONS : REMINDER_OPTIONS
  const o = opts.find(x => x.value === String(min))
  return o ? o.label : `${min}分前`
}

function sortDayEvents(list) {
  return [...list].sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
    const at = a.all_day ? a.start_date : a.start_datetime
    const bt = b.all_day ? b.start_date : b.start_datetime
    return at < bt ? -1 : at > bt ? 1 : 0
  })
}

// ── アジェンダ（リスト）表示（#8） ────────────────────────────

function AgendaView({ events, memberColorMap, baseDate, todayStr, unreadMap = {}, onEventClick }) {
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

function DayDetailModal({ dateStr, events, memberColorMap, unreadMap = {}, onEventClick, onAdd, onClose }) {
  useEscapeKey(onClose)
  const date = new Date(`${dateStr}T00:00:00`)
  const dayEvents = sortDayEvents(events.filter(e => isEventOnDay(e, date)))
  const label = date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
  const holiday = getHoliday(dateStr)

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{label}{holiday && <span className={styles.dayHolidayTag}>{holiday}</span>}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
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
      </div>
    </div>
  )
}

// ── 予定詳細ビュー（閲覧・コメント #5 #6 #9） ────────────────

function EventDetailModal({ event, familyMember, memberColorMap, onNotifyComment, onEdit, onDelete, onDeleteOccurrence, onClose }) {
  useEscapeKey(onClose)
  const color = event.shift_type ? (SHIFT_COLORS[event.shift_type] ?? '#8E81B5') : eventColor(event, memberColorMap)
  const eid = masterId(event)
  const isRecurring = event.recurrence && event.recurrence !== 'none'

  const dateLabel = (() => {
    const base = event.all_day ? event.start_date : toDateStr(new Date(event.start_datetime))
    const d = new Date(`${base}T00:00:00`)
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  })()

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>予定の詳細</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div className={styles.detailBody}>
          <div className={styles.detailTitleRow}>
            <span className={styles.detailColorBar} style={{ background: color }} />
            <h3 className={styles.detailTitle}>{event.title}</h3>
          </div>

          <dl className={styles.detailList}>
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>日時</dt>
              <dd className={styles.detailValue}>{dateLabel}<br />{eventTimeLabel(event)}</dd>
            </div>
            {event.recurrence && event.recurrence !== 'none' && (
              <div className={styles.detailItem}>
                <dt className={styles.detailLabel}>繰り返し</dt>
                <dd className={styles.detailValue}>
                  {RECURRENCE_LABELS[event.recurrence]}
                  {event.recurrence_until && `（${event.recurrence_until}まで）`}
                </dd>
              </div>
            )}
            {event.category && (
              <div className={styles.detailItem}>
                <dt className={styles.detailLabel}>カテゴリ</dt>
                <dd className={styles.detailValue}>
                  <span className={styles.detailChip} style={{ '--cat-color': CATEGORY_COLORS[event.category] ?? '#8E81B5' }}>
                    <span className={styles.categoryDot} style={{ background: CATEGORY_COLORS[event.category] ?? '#8E81B5' }} />{event.category}
                  </span>
                </dd>
              </div>
            )}
            {event.member?.name && (
              <div className={styles.detailItem}>
                <dt className={styles.detailLabel}>担当</dt>
                <dd className={styles.detailValue}>{event.member.name}</dd>
              </div>
            )}
            {event.reminder_minutes != null && (
              <div className={styles.detailItem}>
                <dt className={styles.detailLabel}>通知</dt>
                <dd className={styles.detailValue}>{reminderLabel(event.reminder_minutes, event.all_day)}</dd>
              </div>
            )}
            {event.location && (
              <div className={styles.detailItem}>
                <dt className={styles.detailLabel}>場所</dt>
                <dd className={styles.detailValue}>
                  {event.location}
                  <a className={styles.mapLink} href={mapsUrl(event.location)} target="_blank" rel="noopener noreferrer">地図で開く</a>
                </dd>
              </div>
            )}
            {event.memo && (
              <div className={styles.detailItem}>
                <dt className={styles.detailLabel}>メモ</dt>
                <dd className={styles.detailValue}>{event.memo}</dd>
              </div>
            )}
          </dl>

          <EventReactions eventId={eid} familyMember={familyMember} />

          <EventComments eventId={eid} familyMember={familyMember} eventTitle={event.title} onCommented={onNotifyComment} />
        </div>

        {/* 繰り返し予定は「この回だけ削除」を用意（#3） */}
        {isRecurring && (
          <div className={styles.recurDeleteRow}>
            <button type="button" className={styles.recurDeleteBtn} onClick={onDeleteOccurrence}>この回だけ削除</button>
            <span className={styles.recurDeleteHint}>繰り返し予定（{RECURRENCE_LABELS[event.recurrence]}）</span>
          </div>
        )}

        <div className={styles.formBtns}>
          <button type="button" className={styles.deleteBtn} onClick={onDelete}>{isRecurring ? 'すべて削除' : '削除'}</button>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>閉じる</button>
          <button type="button" className={styles.saveBtn} onClick={onEdit}>編集</button>
        </div>
      </div>
    </div>
  )
}

// ── 予定へのアイコン反応（スタンプ） ─────────────────────────

function EventReactions({ eventId, familyMember }) {
  const [reactions, setReactions] = useState([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('schedule_event_reactions')
      .select('id, emoji, member_id, member_name')
      .eq('event_id', eventId)
    if (data) setReactions(data)
  }, [eventId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`schedule_reactions_${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_event_reactions',
        filter: `event_id=eq.${eventId}`,
      }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [eventId, load])

  // 絵文字ごとに集計（誰が押したか・自分が押したか）
  const summary = useMemo(() => {
    const map = {}
    for (const r of reactions) {
      const m = map[r.emoji] || { emoji: r.emoji, count: 0, names: [], mine: null }
      m.count += 1
      if (r.member_name) m.names.push(r.member_name)
      if (r.member_id === familyMember?.id) m.mine = r.id
      map[r.emoji] = m
    }
    return REACTIONS.map(o => map[o.emoji]).filter(Boolean)
  }, [reactions, familyMember?.id])

  async function toggle(emoji) {
    if (!familyMember) return
    const existing = reactions.find(r => r.emoji === emoji && r.member_id === familyMember.id)
    // 楽観的更新
    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id))
      await supabase.from('schedule_event_reactions').delete().eq('id', existing.id)
    } else {
      const optimistic = { id: `tmp-${emoji}`, emoji, member_id: familyMember.id, member_name: familyMember.name }
      setReactions(prev => [...prev, optimistic])
      await supabase.from('schedule_event_reactions').insert({
        event_id: eventId, family_id: familyMember.family_id,
        member_id: familyMember.id, member_name: familyMember.name, emoji,
      })
    }
    await load()
  }

  return (
    <div className={styles.reactionsSection}>
      {/* 押されている反応（件数・誰が） */}
      {summary.length > 0 && (
        <div className={styles.reactionSummary}>
          {summary.map(s => (
            <button
              key={s.emoji}
              className={`${styles.reactionCount} ${s.mine ? styles.reactionCountMine : ''}`}
              onClick={() => toggle(s.emoji)}
              title={`${REACTION_LABELS[s.emoji] ?? ''}：${s.names.join('、')}`}
            >
              <span className={styles.reactionEmoji}>{s.emoji}</span>
              <span className={styles.reactionCountLabel}>{REACTION_LABELS[s.emoji]}</span>
              <span className={styles.reactionNum}>{s.count}</span>
            </button>
          ))}
        </div>
      )}
      {/* 反応を追加するパレット */}
      <div className={styles.reactionPalette}>
        {REACTIONS.map(({ emoji, label }) => {
          const mine = reactions.some(r => r.emoji === emoji && r.member_id === familyMember?.id)
          return (
            <button
              key={emoji}
              className={`${styles.reactionBtn} ${mine ? styles.reactionBtnMine : ''}`}
              onClick={() => toggle(emoji)}
              aria-label={`${label} で反応`}
              aria-pressed={mine}
            >
              <span className={styles.reactionBtnEmoji}>{emoji}</span>
              <span className={styles.reactionBtnLabel}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 予定コメント（家族間コミュニケーション #5） ──────────────

function EventComments({ eventId, familyMember, eventTitle, onCommented }) {
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('schedule_event_comments')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }, [eventId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`schedule_comments_${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_event_comments',
        filter: `event_id=eq.${eventId}`,
      }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [eventId, load])

  async function send(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text || !familyMember) return
    setSending(true)
    setBody('')
    const { error } = await supabase.from('schedule_event_comments').insert({
      event_id: eventId,
      family_id: familyMember.family_id,
      member_id: familyMember.id,
      member_name: familyMember.name,
      body: text,
    })
    if (error) setBody(text)
    else { await load(); onCommented?.(eventTitle) }   // 家族へ即時通知（#1）
    setSending(false)
  }

  async function remove(id) {
    await supabase.from('schedule_event_comments').delete().eq('id', id)
    await load()
  }

  return (
    <div className={styles.commentsSection}>
      <p className={styles.commentsTitle}>コメント</p>
      <ul className={styles.commentList}>
        {comments.length === 0 && <li className={styles.commentEmpty}>まだコメントはありません</li>}
        {comments.map(c => (
          <li key={c.id} className={styles.commentItem}>
            <div className={styles.commentHead}>
              <span className={styles.commentAuthor}>{c.member_name || '家族'}</span>
              <span className={styles.commentDate}>
                {new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              {c.member_id === familyMember?.id && (
                <button className={styles.commentDelete} onClick={() => remove(c.id)} aria-label="コメントを削除">×</button>
              )}
            </div>
            <p className={styles.commentBody}>{c.body}</p>
          </li>
        ))}
      </ul>
      <form className={styles.commentForm} onSubmit={send}>
        <input
          className={styles.commentInput}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="コメントを入力..."
          maxLength={500}
        />
        <button className={styles.commentSend} type="submit" disabled={sending || !body.trim()}>送信</button>
      </form>
    </div>
  )
}

// ── 年月ジャンプ（#8） ────────────────────────────────────────

// ── 予定の検索 ────────────────────────────────────────────────

function SearchModal({ familyMember, memberColorMap, onSelect, onClose }) {
  useEscapeKey(onClose)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (!term || !familyMember?.family_id) { setResults([]); setSearched(false); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      // PostgREST の or フィルタを壊す文字を除去
      const safe = term.replace(/[,()%*]/g, ' ').trim()
      if (!safe) { setResults([]); setLoading(false); return }
      const { data } = await supabase
        .from('schedule_events')
        .select('*, member:family_members!schedule_events_member_id_fkey(id, name)')
        .eq('family_id', familyMember.family_id)
        .is('shift_type', null)
        .or(`title.ilike.%${safe}%,memo.ilike.%${safe}%,location.ilike.%${safe}%`)
        .limit(80)
      // 実効日で並べ替え：今日以降を昇順→過去を降順
      const todayStr = toDateStr(new Date())
      const eff = e => e.all_day ? e.start_date : toDateStr(new Date(e.start_datetime))
      const rows = (data || []).map(e => ({ ...e, _eff: eff(e) }))
      const future = rows.filter(r => r._eff >= todayStr).sort((a, b) => a._eff < b._eff ? -1 : 1)
      const past = rows.filter(r => r._eff < todayStr).sort((a, b) => a._eff > b._eff ? -1 : 1)
      setResults([...future, ...past])
      setLoading(false)
      setSearched(true)
    }, 250)
    return () => clearTimeout(timer)
  }, [q, familyMember?.family_id])

  function dateLabel(ev) {
    const d = new Date(`${ev._eff}T00:00:00`)
    const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
    const base = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${wd})`
    return ev.all_day ? base : `${base} ${formatTime(ev.start_datetime)}`
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>予定を検索</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <input
          className={styles.input}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="タイトル・メモ・場所で検索..."
          autoFocus
        />
        <div className={styles.searchResults}>
          {loading && <p className={styles.searchHint}>検索中...</p>}
          {!loading && searched && results.length === 0 && (
            <p className={styles.searchHint}>「{q.trim()}」に一致する予定はありません</p>
          )}
          {!loading && !searched && (
            <p className={styles.searchHint}>キーワードを入力してください</p>
          )}
          {results.map(ev => {
            const past = ev._eff < toDateStr(new Date())
            return (
              <button
                key={ev.id}
                className={`${styles.searchRow} ${past ? styles.searchRowPast : ''}`}
                style={{ '--chip-color': eventColor(ev, memberColorMap) }}
                onClick={() => onSelect(ev)}
              >
                <span className={styles.searchBar} />
                <span className={styles.searchBody}>
                  <span className={styles.searchTitle}>
                    {ev.recurrence && ev.recurrence !== 'none' && <span className={styles.recurBadge} aria-hidden="true">↻</span>}
                    {ev.title}
                  </span>
                  <span className={styles.searchMeta}>
                    {dateLabel(ev)}
                    {ev.location && ` ・ ${ev.location}`}
                    {ev.member?.name && ` ・ ${ev.member.name}`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthPickerModal({ baseDate, onSelect, onClose }) {
  useEscapeKey(onClose)
  const [year, setYear] = useState(baseDate.getFullYear())
  const curM = baseDate.getMonth()
  const curY = baseDate.getFullYear()
  const todayM = new Date().getMonth()
  const todayY = new Date().getFullYear()

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.pickerModal}>
        <div className={styles.pickerYearRow}>
          <button className={styles.pickerYearBtn} onClick={() => setYear(y => y - 1)} aria-label="前の年">‹</button>
          <span className={styles.pickerYear}>{year}年</span>
          <button className={styles.pickerYearBtn} onClick={() => setYear(y => y + 1)} aria-label="次の年">›</button>
        </div>
        <div className={styles.pickerGrid}>
          {Array.from({ length: 12 }, (_, m) => {
            const isCur = year === curY && m === curM
            const isToday = year === todayY && m === todayM
            return (
              <button
                key={m}
                className={`${styles.pickerMonth} ${isCur ? styles.pickerMonthActive : ''} ${isToday ? styles.pickerMonthToday : ''}`}
                onClick={() => onSelect(year, m)}
              >
                {m + 1}月
              </button>
            )
          })}
        </div>
        <button className={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// 日程調整（出欠調整）— 候補日を出し合い ⭕🤔❌ で回答→集計→予定に確定
// ══════════════════════════════════════════════════════════════

const POLL_CHOICES = [
  { key: 'ok', emoji: '⭕', label: 'OK' },
  { key: 'maybe', emoji: '🤔', label: '未定' },
  { key: 'ng', emoji: '❌', label: 'NG' },
]

function pollDateLabel(cand) {
  const d = new Date(`${cand.candidate_date}T00:00:00`)
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  const base = `${d.getMonth() + 1}/${d.getDate()}(${wd})`
  return cand.candidate_time ? `${base} ${cand.candidate_time}` : `${base} 終日`
}

function PollsModal({ familyMember, onRefetch, onNotify, onClose }) {
  useEscapeKey(onClose)
  const [polls, setPolls] = useState([])
  const [view, setView] = useState('list')       // 'list' | 'create'
  const [activePollId, setActivePollId] = useState(null)

  const loadPolls = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { data } = await supabase
      .from('schedule_polls')
      .select('*, candidates:schedule_poll_candidates(id)')
      .eq('family_id', familyMember.family_id)
      .order('created_at', { ascending: false })
    if (data) setPolls(data)
  }, [familyMember?.family_id])

  useEffect(() => { loadPolls() }, [loadPolls])

  const activePoll = polls.find(p => p.id === activePollId) || null
  const inSub = view === 'create' || !!activePollId
  const heading = view === 'create' ? '新しい日程調整' : activePoll ? activePoll.title : '日程調整'

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          {inSub && (
            <button className={styles.pollBack} onClick={() => { setView('list'); setActivePollId(null) }} aria-label="戻る">‹</button>
          )}
          <h2 className={styles.modalTitle}>{heading}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        {view === 'create' ? (
          <PollCreate familyMember={familyMember} onNotify={onNotify} onDone={async () => { await loadPolls(); setView('list') }} />
        ) : activePoll ? (
          <PollVote
            poll={activePoll}
            familyMember={familyMember}
            onRefetch={onRefetch}
            onNotify={onNotify}
            onChanged={loadPolls}
            onClose={onClose}
          />
        ) : (
          <PollList polls={polls} onCreate={() => setView('create')} onOpen={setActivePollId} />
        )}
      </div>
    </div>
  )
}

function PollList({ polls, onCreate, onOpen }) {
  return (
    <div className={styles.pollList}>
      <button className={styles.pollCreateBtn} onClick={onCreate}>＋ 新しい日程を調整する</button>
      {polls.length === 0 ? (
        <p className={styles.pollEmpty}>まだ調整中の予定はありません。<br />候補日を出して家族に聞いてみましょう。</p>
      ) : (
        polls.map(p => (
          <button key={p.id} className={styles.pollRow} onClick={() => onOpen(p.id)}>
            <span className={`${styles.pollBadge} ${p.status === 'open' ? styles.pollBadgeOpen : styles.pollBadgeClosed}`}>
              {p.status === 'open' ? '調整中' : '確定'}
            </span>
            <span className={styles.pollRowBody}>
              <span className={styles.pollRowTitle}>{p.title}</span>
              <span className={styles.pollRowMeta}>候補 {p.candidates?.length ?? 0}日{p.created_by_name ? ` ・ ${p.created_by_name}` : ''}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}

function PollCreate({ familyMember, onNotify, onDone }) {
  const today = toDateStr(new Date())
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [cands, setCands] = useState([{ date: today, time: '' }, { date: '', time: '' }])
  const [saving, setSaving] = useState(false)

  function update(i, key, val) {
    setCands(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c))
  }
  function addRow() { setCands(prev => [...prev, { date: '', time: '' }]) }
  function removeRow(i) { setCands(prev => prev.filter((_, idx) => idx !== i)) }

  const valid = title.trim() && cands.some(c => c.date)

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const { data: poll } = await supabase
      .from('schedule_polls')
      .insert({
        family_id: familyMember.family_id,
        title: title.trim(),
        memo: memo.trim() || null,
        created_by: familyMember.id,
        created_by_name: familyMember.name,
      })
      .select('id')
      .single()
    if (poll?.id) {
      const rows = cands
        .filter(c => c.date)
        .map((c, i) => ({
          poll_id: poll.id,
          family_id: familyMember.family_id,
          candidate_date: c.date,
          candidate_time: c.time || null,
          sort_order: i,
        }))
      if (rows.length) await supabase.from('schedule_poll_candidates').insert(rows)
      onNotify?.('poll_created', title.trim(), null)   // 家族へ通知
    }
    setSaving(false)
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.fieldLabel}>
        タイトル
        <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 家族で焼肉、祖父母と食事..." maxLength={100} autoFocus required />
      </label>
      <div className={styles.fieldLabel}>
        候補日（家族に聞きたい日を並べる）
        <div className={styles.pollCandEdit}>
          {cands.map((c, i) => (
            <div key={i} className={styles.pollCandRow}>
              <input className={styles.input} type="date" value={c.date} onChange={e => update(i, 'date', e.target.value)} />
              <input className={styles.input} type="time" value={c.time} onChange={e => update(i, 'time', e.target.value)} placeholder="時刻" />
              {cands.length > 1 && (
                <button type="button" className={styles.pollCandRemove} onClick={() => removeRow(i)} aria-label="この候補を削除">×</button>
              )}
            </div>
          ))}
          <button type="button" className={styles.pollAddCand} onClick={addRow}>＋ 候補日を追加</button>
        </div>
      </div>
      <label className={styles.fieldLabel}>メモ（任意）<input className={styles.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="場所・補足など..." maxLength={200} /></label>
      <div className={styles.formBtns}>
        <button type="submit" className={styles.saveBtn} disabled={saving || !valid}>{saving ? '作成中...' : '家族に聞く'}</button>
      </div>
    </form>
  )
}

function PollVote({ poll, familyMember, onRefetch, onNotify, onChanged, onClose }) {
  const [candidates, setCandidates] = useState([])
  const [votes, setVotes] = useState([])
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    const [{ data: cands }, { data: vs }] = await Promise.all([
      supabase.from('schedule_poll_candidates').select('*').eq('poll_id', poll.id).order('sort_order', { ascending: true }),
      supabase.from('schedule_poll_votes').select('*').eq('poll_id', poll.id),
    ])
    if (cands) setCandidates(cands)
    if (vs) setVotes(vs)
  }, [poll.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`poll_votes_${poll.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_poll_votes', filter: `poll_id=eq.${poll.id}` }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [poll.id, load])

  const myVote = candId => votes.find(v => v.candidate_id === candId && v.member_id === familyMember?.id)?.choice
  const tally = candId => {
    const t = { ok: 0, maybe: 0, ng: 0 }
    for (const v of votes) if (v.candidate_id === candId) t[v.choice] = (t[v.choice] || 0) + 1
    return t
  }
  const names = (candId, choice) => votes.filter(v => v.candidate_id === candId && v.choice === choice).map(v => v.member_name).filter(Boolean).join('、')

  // 最有力候補（OK最多→NG最少）
  const bestId = useMemo(() => {
    let best = null, bestScore = -Infinity
    for (const c of candidates) {
      const t = tally(c.id)
      const score = t.ok * 2 - t.ng
      if (t.ok > 0 && score > bestScore) { bestScore = score; best = c.id }
    }
    return best
  }, [candidates, votes])

  const open = poll.status === 'open'

  async function vote(candId, choice) {
    if (!familyMember) return
    const existing = votes.find(v => v.candidate_id === candId && v.member_id === familyMember.id)
    // この予定に対して自分がまだ一度も回答していないか（初回のみ家族へ通知）
    const firstResponse = !votes.some(v => v.member_id === familyMember.id)
    if (existing && existing.choice === choice) {
      setVotes(prev => prev.filter(v => v !== existing))
      await supabase.from('schedule_poll_votes').delete().eq('candidate_id', candId).eq('member_id', familyMember.id)
    } else {
      await supabase.from('schedule_poll_votes').upsert({
        poll_id: poll.id, candidate_id: candId, family_id: familyMember.family_id,
        member_id: familyMember.id, member_name: familyMember.name, choice,
      }, { onConflict: 'candidate_id,member_id' })
      if (firstResponse) onNotify?.('poll_voted', poll.title, null)   // 初回回答時のみ通知（連打での多重通知を防止）
    }
    await load()
  }

  async function confirm(cand) {
    setConfirming(true)
    const timed = !!cand.candidate_time
    let eventData
    if (timed) {
      const start = new Date(`${cand.candidate_date}T${cand.candidate_time}:00`)
      const end = new Date(start); end.setHours(end.getHours() + 1)
      eventData = {
        family_id: familyMember.family_id, title: poll.title, memo: poll.memo, all_day: false,
        member_id: null, shift_type: null, recurrence: 'none',
        start_date: null, end_date: null, start_datetime: start.toISOString(), end_datetime: end.toISOString(),
      }
    } else {
      eventData = {
        family_id: familyMember.family_id, title: poll.title, memo: poll.memo, all_day: true,
        member_id: null, shift_type: null, recurrence: 'none',
        start_date: cand.candidate_date, end_date: null, start_datetime: null, end_datetime: null,
      }
    }
    const { data: inserted } = await supabase.from('schedule_events').insert(eventData).select('id').single()
    if (inserted?.id) {
      await supabase.from('schedule_polls').update({ status: 'closed', confirmed_event_id: inserted.id }).eq('id', poll.id)
      onNotify?.('created', poll.title, inserted.id)
    }
    setConfirming(false)
    await onRefetch()
    await onChanged()
    onClose()
  }

  return (
    <div className={styles.pollVote}>
      {poll.memo && <p className={styles.pollMemo}>{poll.memo}</p>}
      {!open && <p className={styles.pollClosedNote}>この日程は確定済みです。</p>}

      <div className={styles.pollCands}>
        {candidates.map(c => {
          const t = tally(c.id)
          const isBest = open && c.id === bestId
          return (
            <div key={c.id} className={`${styles.pollCand} ${isBest ? styles.pollCandBest : ''}`}>
              <div className={styles.pollCandHead}>
                <span className={styles.pollCandDate}>{pollDateLabel(c)}{isBest && <span className={styles.pollBestTag}>最有力</span>}</span>
                <span className={styles.pollTally}>
                  {POLL_CHOICES.map(ch => (
                    <span key={ch.key} className={styles.pollTallyItem} title={names(c.id, ch.key)}>{ch.emoji}{t[ch.key]}</span>
                  ))}
                </span>
              </div>
              {open && (
                <div className={styles.pollChoiceRow}>
                  {POLL_CHOICES.map(ch => {
                    const mine = myVote(c.id) === ch.key
                    return (
                      <button
                        key={ch.key}
                        className={`${styles.pollChoiceBtn} ${mine ? styles.pollChoiceBtnMine : ''}`}
                        onClick={() => vote(c.id, ch.key)}
                        aria-pressed={mine}
                      >
                        <span className={styles.reactionBtnEmoji}>{ch.emoji}</span>{ch.label}
                      </button>
                    )
                  })}
                  <button className={styles.pollConfirmBtn} onClick={() => confirm(c)} disabled={confirming}>
                    この日で確定
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
