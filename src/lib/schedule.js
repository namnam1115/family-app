/**
 * 予定表（SchedulePage）の定数と純粋なユーティリティ。
 * React に依存しないため、そのままテスト・再利用できる。
 */

export const MEMBER_COLORS = [
  '#8E81B5', '#C2826A', '#5A9E82', '#C49A5A',
  '#6B9EC2', '#C26B8E', '#6BC2B4', '#9E6BC2',
]

export const SHIFT_TYPES = ['日勤', '夜勤', '明け', '休み']

export const SHIFT_COLORS = {
  '日勤': '#3B82F6',
  '夜勤': '#7C3AED',
  '明け': '#F59E0B',
  '休み': '#10B981',
}

// 予定カテゴリ（色分け #10）

export const CATEGORIES = [
  { key: '仕事', color: '#6B9EC2' },
  { key: '学校', color: '#5A9E82' },
  { key: '病院', color: '#C26B8E' },
  { key: '家事', color: '#C49A5A' },
  { key: '行事', color: '#9E6BC2' },
  { key: '遊び', color: '#C2826A' },
]

export const CATEGORY_COLORS = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]))

// リマインダー選択肢（#4）

export const REMINDER_OPTIONS = [
  { value: '', label: 'なし' },
  { value: '10', label: '10分前' },
  { value: '30', label: '30分前' },
  { value: '60', label: '1時間前' },
  { value: '1440', label: '1日前' },
]
// 終日予定は当日朝（JST 9:00）を基準に通知

export const ALLDAY_REMINDER_OPTIONS = [
  { value: '', label: 'なし' },
  { value: '0', label: '当日の朝' },
  { value: '1440', label: '前日の朝' },
  { value: '2880', label: '2日前の朝' },
]

// 繰り返し選択肢（#3）

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: '繰り返さない' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'monthly', label: '毎月' },
  { value: 'yearly', label: '毎年' },
]

export const RECURRENCE_LABELS = Object.fromEntries(RECURRENCE_OPTIONS.map(o => [o.value, o.label]))

// 予定へのアイコン反応（スタンプ）。⭕=OK / ❌=NG を中心に出欠調整にも使える

export const REACTIONS = [
  { emoji: '⭕', label: 'OK' },
  { emoji: '❌', label: 'NG' },
  { emoji: '🤔', label: '未定' },
  { emoji: '👍', label: 'いいね' },
  { emoji: '🙏', label: 'たのむ' },
  { emoji: '🎉', label: 'やった' },
]

export const REACTION_LABELS = Object.fromEntries(REACTIONS.map(r => [r.emoji, r.label]))

// 色決定：カテゴリ優先 → メンバー色 → 既定（#10）

export function eventColor(event, memberColorMap) {
  if (event.category && CATEGORY_COLORS[event.category]) return CATEGORY_COLORS[event.category]
  if (event.member_id && memberColorMap[event.member_id]) return memberColorMap[event.member_id]
  return '#8E81B5'
}

// 繰り返し予定・オカレンスの元IDを取得（DB操作はマスターに対して行う）

export function masterId(event) {
  return event.master_id ?? event.id
}

// Esc キーでモーダルを閉じる（アクセシビリティ）

export function cycleShift(current) {
  if (!current) return '日勤'
  const idx = SHIFT_TYPES.indexOf(current)
  return idx === SHIFT_TYPES.length - 1 ? null : SHIFT_TYPES[idx + 1]
}

// ── 日付ユーティリティ ────────────────────────────────────────

export function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// datetime-local 入力用にローカル時刻の 'YYYY-MM-DDTHH:mm' を返す。
// toISOString() は UTC に変換され時刻がズレるため使わない。

export function toLocalInput(date) {
  const d = new Date(date)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function isEventOnDay(event, date) {
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

export function getWeekDates(baseDate) {
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

export function addByRule(date, rule, n) {
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

export function expandEvent(event, rangeStartStr, rangeEndStr) {
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

export function getMonthGrid(baseDate) {
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

export function eventTimeLabel(ev) {
  if (ev.all_day) {
    if (ev.end_date && ev.end_date !== ev.start_date) {
      return `${ev.start_date} 〜 ${ev.end_date}`
    }
    return '終日'
  }
  return `${formatTime(ev.start_datetime)}–${formatTime(ev.end_datetime)}`
}

export function mapsUrl(loc) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`
}

export function reminderLabel(min, allDay) {
  const opts = allDay ? ALLDAY_REMINDER_OPTIONS : REMINDER_OPTIONS
  const o = opts.find(x => x.value === String(min))
  return o ? o.label : `${min}分前`
}

export function sortDayEvents(list) {
  return [...list].sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
    const at = a.all_day ? a.start_date : a.start_datetime
    const bt = b.all_day ? b.start_date : b.start_datetime
    return at < bt ? -1 : at > bt ? 1 : 0
  })
}

// ── アジェンダ（リスト）表示（#8） ────────────────────────────
