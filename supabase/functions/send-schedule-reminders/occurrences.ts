// 繰り返し予定のオカレンス計算（Deno API に依存しない純粋なロジック）。
//
// クライアント側の実装は src/lib/schedule.js。両者は同じ暦日で計算する必要があり、
// ズレると「この回だけ削除」した回にリマインダーが飛ぶ等の不整合が起きる。
// クライアントはブラウザのローカル時刻（＝日本の利用者では JST）で暦日を扱うため、
// こちらも UTC ではなく JST の暦日で計算する。
// 一致は scripts/check-recurrence-parity.mjs で検証できる。

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY = 86400000

// 終日予定のリマインダー基準時刻（JST 9:00）
export const ALLDAY_HOUR_JST = 9

export type Ev = {
  id: string
  family_id: string
  title: string
  all_day: boolean
  start_date: string | null
  start_datetime: string | null
  reminder_minutes: number
  recurrence: string
  recurrence_until: string | null
  recurrence_exceptions: string[] | null
}

// JST の暦日で計算するため +9h ずらした Date に対して UTC 系メソッドを使う
function toJst(ms: number): Date {
  return new Date(ms + JST_OFFSET_MS)
}

function fromJst(d: Date): number {
  return d.getTime() - JST_OFFSET_MS
}

/** その瞬間の JST 日付を 'YYYY-MM-DD' で返す */
export function jstDateStr(ms: number): string {
  const d = toJst(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** 繰り返し規則で n 回進めた開始時刻（ms）。月末は対象月の末日にクランプする */
export function addByRule(baseMs: number, rule: string, n: number): number {
  const d = toJst(baseMs)
  if (rule === 'daily') d.setUTCDate(d.getUTCDate() + n)
  else if (rule === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * n)
  else if (rule === 'monthly' || rule === 'yearly') {
    const day = d.getUTCDate()
    d.setUTCDate(1)
    if (rule === 'monthly') d.setUTCMonth(d.getUTCMonth() + n)
    else d.setUTCFullYear(d.getUTCFullYear() + n)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
  }
  return fromJst(d)
}

// target の頃まで進めるのに必要な繰り返し回数の概算（少なめに見積もる）。
// 先頭から総当たりすると daily の予定が日数分だけ回って上限に達するため逆算する。
function startIndexAt(baseMs: number, rule: string, targetMs: number): number {
  const diffDays = Math.floor((targetMs - baseMs) / DAY)
  if (diffDays <= 0) return 0
  let n: number
  if (rule === 'daily') n = diffDays
  else if (rule === 'weekly') n = Math.floor(diffDays / 7)
  else {
    const b = toJst(baseMs)
    const t = toJst(targetMs)
    if (rule === 'monthly') {
      n = (t.getUTCFullYear() - b.getUTCFullYear()) * 12 + (t.getUTCMonth() - b.getUTCMonth())
    } else if (rule === 'yearly') n = t.getUTCFullYear() - b.getUTCFullYear()
    else return 0
  }
  // 月末クランプで概算が 1 回ずれることがあるため手前に戻す
  return Math.max(0, n - 2)
}

/** 予定の開始時刻（ms）。終日予定は JST 9:00 を基準にする */
export function baseStartMs(ev: Ev): number {
  return ev.all_day
    ? Date.parse(`${ev.start_date}T${String(ALLDAY_HOUR_JST).padStart(2, '0')}:00:00+09:00`)
    : Date.parse(ev.start_datetime!)
}

/**
 * いま通知すべきオカレンス（リマインド時刻を過ぎ、まだ開始していないもの）を返す。
 * 二重送信の防止は呼び出し側の schedule_reminder_log が担う。
 */
export function dueOccurrences(ev: Ev, now: number): { occDateStr: string; startMs: number }[] {
  const baseStart = baseStartMs(ev)
  if (isNaN(baseStart)) return []

  const remindMs = ev.reminder_minutes * 60000
  const exceptions = new Set(ev.recurrence_exceptions || [])
  const untilMs = ev.recurrence_until ? Date.parse(`${ev.recurrence_until}T23:59:59+09:00`) : null

  const out: { occDateStr: string; startMs: number }[] = []
  const isRecurring = !!ev.recurrence && ev.recurrence !== 'none'
  // 対象は now 前後の数回だけなので、逆算した位置から少しだけ進めれば足りる
  const startN = isRecurring ? startIndexAt(baseStart, ev.recurrence, now) : 0
  const steps = isRecurring ? 64 : 1

  for (let i = 0; i < steps; i++) {
    const n = startN + i
    const startMs = isRecurring ? addByRule(baseStart, ev.recurrence, n) : baseStart
    if (untilMs && startMs > untilMs) break
    // リマインド時刻にまだ到達していない回が出たら、以降はさらに未来なので終了
    if (startMs - remindMs > now) break
    // 既に開始済みなら通知不要
    if (now >= startMs) continue
    const occDateStr = jstDateStr(startMs)
    if (exceptions.has(occDateStr)) continue
    out.push({ occDateStr, startMs })
  }
  return out
}
