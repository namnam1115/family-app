import { useState } from 'react'
import Modal from '../Modal'
import styles from './Schedule.module.css'

export default function MonthPickerModal({ baseDate, onSelect, onClose }) {
  const [year, setYear] = useState(baseDate.getFullYear())
  const curM = baseDate.getMonth()
  const curY = baseDate.getFullYear()
  const todayM = new Date().getMonth()
  const todayY = new Date().getFullYear()

  return (
    <Modal open onClose={onClose} variant="plain" size="auto" className={styles.pickerModal}>
      <div className={styles.pickerYearRow}>
        <button className={styles.pickerYearBtn} onClick={() => setYear(y => y - 1)} aria-label="前の年">‹</button>
        <span className={styles.pickerYear}>{year}年</span>
        <button className={styles.pickerYearBtn} onClick={() => setYear(y => y + 1)} aria-label="次の年">›</button>
      </div>
      <div className={styles.pickerGrid}>
        {Array.from({ length: 12 }, (_, m) => {
          const isCur = year === curY && m === curM
          const isToday = year === todayY && m === todayM
          return (
            <button
              key={m}
              className={`${styles.pickerMonth} ${isCur ? styles.pickerMonthActive : ''} ${isToday ? styles.pickerMonthToday : ''}`}
              onClick={() => onSelect(year, m)}
            >
              {m + 1}月
            </button>
          )
        })}
      </div>
      <button className={styles.cancelBtn} onClick={onClose}>閉じる</button>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════
// 日程調整（出欠調整）— 候補日を出し合い ⭕🤔❌ で回答→集計→予定に確定
// ══════════════════════════════════════════════════════════════
