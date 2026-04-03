import { useNavigate } from 'react-router-dom'
import styles from './AppCard.module.css'

export default function AppCard({ icon, title, description, path, available }) {
  const navigate = useNavigate()

  return (
    <div
      className={`${styles.card} ${!available ? styles.disabled : ''}`}
      onClick={() => available && navigate(path)}
      role={available ? 'button' : undefined}
      tabIndex={available ? 0 : undefined}
      onKeyDown={e => available && e.key === 'Enter' && navigate(path)}
    >
      <span className={styles.icon}>{icon}</span>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.desc}>{description}</p>
      </div>
      {!available && <span className={styles.comingSoon}>近日公開</span>}
      {available && <span className={styles.arrow}>→</span>}
    </div>
  )
}
