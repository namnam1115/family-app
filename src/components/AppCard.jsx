import { useNavigate } from 'react-router-dom'
import { IconArrowRight } from '../lib/icons'
import styles from './AppCard.module.css'

export default function AppCard({ icon: Icon, title, description, path, available }) {
  const navigate = useNavigate()

  return (
    <div
      className={`${styles.card} ${!available ? styles.disabled : ''}`}
      onClick={() => available && navigate(path)}
      role={available ? 'button' : undefined}
      tabIndex={available ? 0 : undefined}
      onKeyDown={e => available && e.key === 'Enter' && navigate(path)}
    >
      <span className={styles.icon}>{Icon && <Icon />}</span>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.desc}>{description}</p>
      </div>
      {!available && <span className={styles.comingSoon}>近日公開</span>}
      {available && <span className={styles.arrow}><IconArrowRight /></span>}
    </div>
  )
}
