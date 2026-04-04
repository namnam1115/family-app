import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushStatus() {
  if (!isPushSupported()) return { supported: false, permission: 'denied', subscribed: false }
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!subscription,
  }
}

export async function subscribeToPush(familyId, userId) {
  if (!isPushSupported()) throw new Error('このブラウザはプッシュ通知に対応していません')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('通知の許可が得られませんでした')

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  })

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      family_id: familyId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'user_id,endpoint' }
  )
  if (error) throw error
  return sub
}

export async function unsubscribeFromPush(userId) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.toJSON().endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
}
