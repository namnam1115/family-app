/**
 * 動画URL（YouTube / TikTok）の解析と、アプリ内埋め込みプレイヤーURLの生成。
 *
 * TikTok のサムネイル CDN URL は期限付きで無効化されるため、
 * 埋め込みプレイヤー（サムネイル込み）で再生できるようにするのがこのモジュールの主目的。
 */

export function extractYouTubeId(url) {
  if (!url) return null
  const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/)
  if (shortsMatch) return shortsMatch[1]
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/)
  if (shortMatch) return shortMatch[1]
  const watchMatch = url.match(/[?&]v=([^?&/]+)/)
  if (watchMatch) return watchMatch[1]
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/)
  if (embedMatch) return embedMatch[1]
  return null
}

// vm.tiktok.com / vt.tiktok.com の短縮URLは ID を含まないため取得できない（外部リンクにフォールバック）
export function extractTikTokId(url) {
  if (!url) return null
  const match = url.match(/tiktok\.com\/(?:@[\w.-]+\/)?(?:video|photo)\/(\d+)/)
  return match ? match[1] : null
}

export function getPlatform(url) {
  if (!url) return null
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('tiktok.com')) return 'tiktok'
  return 'web'
}

export function getYouTubeThumbnail(url) {
  const id = extractYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

/**
 * 埋め込み再生できる動画なら { platform, embedUrl, vertical } を返す。
 * 埋め込めないURL（Web記事・TikTok短縮URLなど）は null。
 */
export function getVideoEmbed(url) {
  const youtubeId = extractYouTubeId(url)
  if (youtubeId) {
    return {
      platform: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0`,
      vertical: url.includes('/shorts/'),
    }
  }
  const tiktokId = extractTikTokId(url)
  if (tiktokId) {
    return {
      platform: 'tiktok',
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokId}`,
      vertical: true,
    }
  }
  return null
}
