import { lazy } from 'react'

const RELOAD_KEY = 'chunk-reload-at'
const RELOAD_COOLDOWN_MS = 60000

function lastReloadAt() {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) || 0)
  } catch {
    return 0
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* プライベートモード等で使えなくても致命的ではない */ }
}

/**
 * ルートの遅延読み込み。
 *
 * 新しいデプロイの後、古いタブは既に削除されたチャンクを取りにいって
 * 動的 import に失敗する（ErrorBoundary の「再試行」では復旧しない）。
 * その場合だけ一度リロードして最新のインデックスを取り直す。
 * オフライン時は取得できないのが当然なのでリロードせず、そのまま失敗させる。
 */
export function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch(err => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline || Date.now() - lastReloadAt() < RELOAD_COOLDOWN_MS) throw err
      console.error('チャンクの取得に失敗したため再読み込みします:', err)
      markReloaded()
      window.location.reload()
      return new Promise(() => {})   // リロードが走るまで解決させない
    })
  )
}
