import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

// ============================================================
// Web Push ヘルパー (ブラウザ専用)
// ============================================================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function isWebPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// ============================================================
// ネイティブ Push (Capacitor / FCM / APNs)
// ============================================================

async function registerNativePush(familyId, userId) {
  // 権限リクエスト
  let permStatus = await PushNotifications.checkPermissions()
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions()
  }
  if (permStatus.receive !== 'granted') {
    throw new Error('通知の許可が得られませんでした')
  }

  // FCM / APNs に登録 → token イベントで受け取る
  await PushNotifications.register()

  return new Promise((resolve, reject) => {
    // 登録成功: FCM/APNs トークンを取得して DB に保存
    PushNotifications.addListener('registration', async (token) => {
      const platform = Capacitor.getPlatform() // 'android' | 'ios'
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          family_id: familyId,
          endpoint: `native:${platform}:${userId}`, // ネイティブの一意キー
          platform,
          fcm_token: token.value,
          p256dh: null,
          auth: null,
        },
        { onConflict: 'user_id,endpoint' }
      )
      if (error) reject(error)
      else resolve(token.value)
    })

    PushNotifications.addListener('registrationError', (err) => {
      reject(new Error(`Push 登録エラー: ${err.error}`))
    })
  })
}

// ============================================================
// 共通 API
// ============================================================

export function isPushSupported() {
  if (Capacitor.isNativePlatform()) return true
  return isWebPushSupported()
}

export async function getPushStatus() {
  if (Capacitor.isNativePlatform()) {
    const permStatus = await PushNotifications.checkPermissions()
    return {
      supported: true,
      permission: permStatus.receive, // 'granted' | 'denied' | 'prompt'
      subscribed: permStatus.receive === 'granted',
    }
  }

  if (!isWebPushSupported()) return { supported: false, permission: 'denied', subscribed: false }
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!subscription,
  }
}

export async function subscribeToPush(familyId, userId) {
  if (Capacitor.isNativePlatform()) {
    return registerNativePush(familyId, userId)
  }

  // --- Web Push フロー ---
  if (!isWebPushSupported()) throw new Error('このブラウザはプッシュ通知に対応していません')

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('VAPID公開鍵が設定されていません（VITE_VAPID_PUBLIC_KEY）')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('通知の許可が得られませんでした')

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      family_id: familyId,
      endpoint: json.endpoint,
      platform: 'web',
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      fcm_token: null,
    },
    { onConflict: 'user_id,endpoint' }
  )
  if (error) throw error
  return sub
}

export async function unsubscribeFromPush(userId) {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', `native:${platform}:${userId}`)
    return
  }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.toJSON().endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
}
