import styles from './LoadingSpinner.module.css'

/**
 * inline: true でページ内の一部（<main> 内など）に埋め込む表示に切り替える。
 * 既定（false）はルート直下のフルスクリーン読み込み（HomePage 等）向け。
 */
export default function LoadingSpinner({ message = '読み込み中...', inline = false }) {
  return (
    <div className={`${styles.container} ${inline ? styles.inline : ''}`}>
      <div className={styles.spinner} />
      <p className={styles.message}>{message}</p>
    </div>
  )
}
