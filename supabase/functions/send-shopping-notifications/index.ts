import webpush from 'npm:web-push@3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// FCM HTTP v1 API へのアクセストークンを取得 (Service Account JWT)
async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  // Deno の crypto.subtle で RS256 署名
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemBody = sa.private_key.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '')
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  )
  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  return data.access_token
}

// FCM HTTP v1 API でネイティブプッシュを送信
async function sendFcmNotification(
  projectId: string,
  accessToken: string,
  fcmToken: string,
  title: string,
  body: string,
): Promise<{ success: boolean; expired: boolean }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          android: { notification: { channelId: 'shopping-reminder', icon: 'ic_notification' } },
          apns: { payload: { aps: { badge: 1, sound: 'default' } } },
        },
      }),
    }
  )
  const expired = res.status === 404 || res.status === 410
  return { success: res.ok, expired }
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
    // FCM 用 (ネイティブアプリ): Firebase プロジェクト ID + サービスアカウント JSON (base64)
    const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')
    const FIREBASE_SERVICE_ACCOUNT_B64 = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_B64')

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // FCM アクセストークン (ネイティブ Push がある場合のみ取得)
    let fcmAccessToken: string | null = null
    if (FIREBASE_PROJECT_ID && FIREBASE_SERVICE_ACCOUNT_B64) {
      const serviceAccountJson = atob(FIREBASE_SERVICE_ACCOUNT_B64)
      fcmAccessToken = await getFcmAccessToken(serviceAccountJson)
    }

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

      // プッシュサブスクリプションを取得 (platform カラムも含む)
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, platform, fcm_token')
        .eq('family_id', family_id)

      if (!subs?.length) continue

      const names = (items as { name: string }[]).slice(0, 5).map(i => i.name).join('、')
      const body = items.length > 5 ? `${names} 他${items.length - 5}件` : names
      const title = '🛒 買い物リマインダー'

      for (const sub of subs as { endpoint: string; p256dh: string; auth: string; platform: string; fcm_token: string | null }[]) {
        const platform = sub.platform ?? 'web'

        if (platform === 'web') {
          // Web Push (VAPID)
          const payload = JSON.stringify({ title, body, url: '/shopping' })
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            )
            totalSent++
          } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string }
            if (e.statusCode === 410 || e.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
            console.error('Web Push failed:', e.message)
          }
        } else if ((platform === 'android' || platform === 'ios') && sub.fcm_token) {
          // FCM (Android / iOS ネイティブ)
          if (!fcmAccessToken || !FIREBASE_PROJECT_ID) {
            console.warn('FCM 設定がありません (FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_B64)')
            continue
          }
          try {
            const { success, expired } = await sendFcmNotification(
              FIREBASE_PROJECT_ID, fcmAccessToken, sub.fcm_token, title, body
            )
            if (success) totalSent++
            if (expired) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
          } catch (err: unknown) {
            const e = err as { message?: string }
            console.error('FCM Push failed:', e.message)
          }
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
