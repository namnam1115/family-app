import { useState } from 'react'
import { IconPlayCircle, IconClose, IconYoutube, IconMusic, IconWeb } from '../lib/icons'
import { getVideoEmbed, getPlatform } from '../utils/videoEmbed'
import styles from './VideoEmbed.module.css'

const PLATFORM_FALLBACK = {
  youtube: { Icon: IconYoutube, label: 'YouTube' },
  tiktok:  { Icon: IconMusic,  label: 'TikTok' },
  web:     { Icon: IconWeb,    label: 'Web' },
}

/**
 * 一覧の中で動画をその場で再生するためのプレイヤー枠。
 *
 * 停止中はサムネイル（+ 再生ボタン）、再生中は埋め込み iframe を表示する。
 * TikTok のサムネイル URL は期限切れで無効になるため、読み込みに失敗しても
 * 枠を消さずプレースホルダーを出し、再生導線を残す（`onPosterError` で再取得も依頼する）。
 *
 * 再生状態は親が持つ（`playing` / `onPlay` / `onStop`）。一覧で同時に 1 本だけ
 * 再生させたい場合に、親側で制御できるようにするため。
 */
export default function VideoEmbed({
  url,
  posterUrl,
  title,
  playing = false,
  onPlay,
  onStop,
  onPosterError,
  badge,
}) {
  const [failedPosterUrl, setFailedPosterUrl] = useState(null)

  const embed = getVideoEmbed(url)
  const platform = getPlatform(url)
  const fallback = PLATFORM_FALLBACK[platform] ?? PLATFORM_FALLBACK.web
  const showPoster = !!posterUrl && failedPosterUrl !== posterUrl

  if (!embed && !showPoster) return null

  function handlePosterError() {
    setFailedPosterUrl(posterUrl)
    onPosterError?.()
  }

  if (embed && playing) {
    return (
      <div className={`${styles.frame} ${embed.vertical ? styles.vertical : ''}`}>
        <iframe
          className={styles.player}
          src={embed.embedUrl}
          title={`${title} の動画`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <button
          type="button"
          className={styles.stopBtn}
          onClick={onStop}
          aria-label="動画を閉じる"
        ><IconClose /></button>
      </div>
    )
  }

  const posterContent = showPoster ? (
    <img
      src={posterUrl}
      alt={title}
      className={styles.poster}
      loading="lazy"
      onError={handlePosterError}
    />
  ) : (
    <span className={styles.placeholder}>
      <fallback.Icon className={styles.placeholderIcon} />
      <span className={styles.placeholderLabel}>{fallback.label}</span>
    </span>
  )

  return (
    <div className={styles.frame}>
      {embed ? (
        <button
          type="button"
          className={styles.posterBtn}
          onClick={onPlay}
          aria-label={`${title} の動画を再生`}
        >
          {posterContent}
          <span className={styles.playOverlay}><IconPlayCircle /></span>
        </button>
      ) : posterContent}
      {badge}
    </div>
  )
}
