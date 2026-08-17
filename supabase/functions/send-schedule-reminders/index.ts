import webpush from 'npm:web-push@3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY = 86400000
// 終日予定のリマインダー基準時刻（JST 9:00）
const ALLDAY_HOUR_JST = 9

type Ev = {
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

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

// 繰り返し規則で n 回進めた開始時刻（UTC ms）を返す
function addByRule(baseMs: number, rule: string, n: number): number {
  const d = new Date(baseMs)
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
  return d.getTime()
}

// この予定の「リマインドすべきオカレンス」を [windowStart, windowEnd] から探す
function dueOccurrences(ev: Ev, now: number): { occDateStr: string; startMs: number }[] {
  // 予定開始の絶対時刻（ms）
  const baseStart = ev.all_day
    ? Date.parse(`${ev.start_date}T${String(ALLDAY_HOUR_JST - 9).padStart(2, '0')}:00:00Z`) // JST9:00 = UTC0:00
    : Date.parse(ev.start_datetime!)
  if (isNaN(baseStart)) return []

  const remindMs = ev.reminder_minutes * 60000
  const exceptions = new Set(ev.recurrence_exceptions || [])
  const untilMs = ev.recurrence_until ? Date.parse(`${ev.recurrence_until}T23:59:59Z`) : null

  const out: { occDateStr: string; startMs: number }[] = []
  const isRecurring = ev.recurrence && ev.recurrence !== 'none'
  const maxN = isRecurring ? 800 : 1

  for (let n = 0; n < maxN; n++) {
    const startMs = isRecurring ? addByRule(baseStart, ev.recurrence, n) : baseStart
    if (untilMs && startMs > untilMs) break
    // まだ先すぎる（リマインド時刻に到達していない）オカレンスが出たら終了
    const remindAt = startMs - remindMs
    if (remindAt > now) {
      // 未来。単発なら終了、繰り返しでもこれ以降は更に未来なので終了
      break
    }
    // 既に開始済みなら通知不要
    if (now >= startMs) continue
    const occDateStr = ymd(new Date(ev.all_day ? Date.parse(`${ev.start_date}T00:00:00Z`) + (startMs - baseStart) : startMs))
    if (exceptions.has(occDateStr)) continue
    // remindAt <= now < startMs → 送信対象
    out.push({ occDateStr, startMs })
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const now = Date.now()
    // リマインダー指定ありの予定をすべて取得（開始時刻の絞り込みは繰り返しがあるため行わない）
    const { data: events, error } = await supabase
      .from('schedule_events')
      .select('id, family_id, title, all_day, start_date, start_datetime, reminder_minutes, recurrence, recurrence_until, recurrence_exceptions')
      .not('reminder_minutes', 'is', null)

    if (error) throw error
    if (!events?.length) {
      return new Response(JSON.stringify({ message: 'No reminders configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 家族ごとの購読をキャッシュ
    const subsCache: Record<string, { endpoint: string; p256dh: string; auth: string }[]> = {}
    async function getSubs(familyId: string) {
      if (!subsCache[familyId]) {
        const { data } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('family_id', familyId)
        subsCache[familyId] = data || []
      }
      return subsCache[familyId]
    }

    let sent = 0
    for (const ev of events as Ev[]) {
      for (const occ of dueOccurrences(ev, now)) {
        // 送信ログで二重送信を防止
        const { error: logErr } = await supabase
          .from('schedule_reminder_log')
          .insert({ event_id: ev.id, occurrence_date: occ.occDateStr })
        if (logErr) continue // 既に送信済み（PK 重複）

        const subs = await getSubs(ev.family_id)
        if (!subs.length) continue

        const timeLabel = ev.all_day
          ? new Date(occ.startMs).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
          : new Date(occ.startMs).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' })
        const payload = JSON.stringify({
          title: '📅 まもなく予定',
          body: `${timeLabel} ${ev.title}`,
          url: '/schedule',
        })

        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            )
            sent++
          } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string }
            if (e.statusCode === 410 || e.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
            console.error('Push failed:', e.message)
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
