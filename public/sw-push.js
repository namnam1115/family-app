// プッシュ通知ハンドラ（workbox の generateSW に importScripts で注入）

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { body: event.data.text() }
  }

  const url = data.url || '/'
  // tag が同じ通知は OS 上で上書きされる。種類ごとに別タグを送る想定で、
  // 未指定時は URL 単位に分けて別種の通知が消し合わないようにする。
  const tag = data.tag || `family-app:${url}`

  event.waitUntil(
    self.registration.showNotification(data.title || '家族プラットフォーム', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
