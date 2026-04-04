// プッシュ通知ハンドラ（workbox の generateSW に importScripts で注入）

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: '買い物リスト', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '🛒 買い物リスト', {
      body: data.body || '重要なアイテムが残っています',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'shopping-reminder',
      renotify: true,
      data: { url: data.url || '/shopping' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/shopping'
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
