import webpush from 'npm:web-push@3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // 現在のJST時（UTC+9）
    const now = new Date()
    const jstHour = (now.getUTCHours() + 9) % 24

    // 通知時刻が一致する家族設定を取得
    const { data: settings, error: settingsError } = await supabase
      .from('family_settings')
      .select('family_id')
      .eq('notification_enabled', true)
      .eq('notification_hour', jstHour)

    if (settingsError) throw settingsError

    if (!settings?.length) {
      return new Response(JSON.stringify({ message: 'No notifications scheduled for this hour' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let totalSent = 0

    for (const { family_id } of settings) {
      // この家族のショッピングリストIDを取得
      const { data: lists } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('family_id', family_id)

      if (!lists?.length) continue

      const listIds = lists.map((l: { id: string }) => l.id)

      // 重要かつ未購入のアイテムを取得
      const { data: items } = await supabase
        .from('shopping_items')
        .select('name')
        .eq('important', true)
        .eq('checked', false)
        .in('list_id', listIds)

      if (!items?.length) continue

      // プッシュサブスクリプションを取得
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('family_id', family_id)

      if (!subs?.length) continue

      const names = (items as { name: string }[]).slice(0, 5).map(i => i.name).join('、')
      const body = items.length > 5 ? `${names} 他${items.length - 5}件` : names

      const payload = JSON.stringify({
        title: '🛒 買い物リマインダー',
        body,
        url: '/shopping',
      })

      for (const sub of subs as { endpoint: string; p256dh: string; auth: string }[]) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          totalSent++
        } catch (err: unknown) {
          const e = err as { statusCode?: number; message?: string }
          // 期限切れサブスクリプションを削除
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
          console.error('Push failed:', e.message)
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
