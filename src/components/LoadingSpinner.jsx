import styles from './LoadingSpinner.module.css'

export default function LoadingSpinner({ message = '読み込み中...' }) {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <p className={styles.message}>{message}</p>
    </div>
  )
}
