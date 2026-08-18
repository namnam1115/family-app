import webpush from 'npm:web-push@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Ev, dueOccurrences } from './occurrences.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
          tag: `schedule-reminder:${ev.id}:${occ.occDateStr}`,
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
