import webpush from 'npm:web-push@3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 予定の追加・更新・コメント時に、本人以外の家族デバイスへ即時 push する。
// body: { family_id, actor_name, actor_user_id, action: 'created'|'updated'|'commented', title }
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { family_id, actor_name, actor_user_id, action, title } = await req.json()
    if (!family_id || !action) {
      return new Response(JSON.stringify({ error: 'family_id and action required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [{ data: subs }, { data: mutedPrefs }] = await Promise.all([
      supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, user_id')
        .eq('family_id', family_id),
      supabase
        .from('schedule_notify_prefs')
        .select('user_id')
        .eq('family_id', family_id)
        .eq('notify_on_change', false),
    ])

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 通知OFF にしているユーザー
    const muted = new Set((mutedPrefs || []).map((p: { user_id: string }) => p.user_id))

    const verb = action === 'created' ? '追加' : action === 'updated' ? '更新' : 'コメント'
    const who = actor_name || '家族'
    const emoji = action === 'commented' ? '💬' : '📅'
    const body = action === 'commented'
      ? `${who} が「${title}」にコメントしました`
      : `${who} が「${title}」を${verb}しました`
    const payload = JSON.stringify({ title: `${emoji} 予定の${verb}`, body, url: '/schedule' })

    let sent = 0
    for (const sub of subs as { endpoint: string; p256dh: string; auth: string; user_id: string }[]) {
      // 本人のデバイス・通知OFFのユーザーには送らない
      if (actor_user_id && sub.user_id === actor_user_id) continue
      if (muted.has(sub.user_id)) continue
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
