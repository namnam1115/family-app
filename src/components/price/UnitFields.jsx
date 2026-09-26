import { UNITS } from '../../lib/price'
import styles from './Price.module.css'

/** 内容量（数量 + 単位）の入力。単価比較に使う */
export default function UnitFields({ quantity, unit, onQuantityChange, onUnitChange, onKeyDown, compact = false }) {
  return (
    <div className={`${styles.unitFields} ${compact ? styles.unitFieldsCompact : ''}`}>
      <input
        className={compact ? styles.compareNoteInput : styles.input}
        type="number"
        inputMode="decimal"
        value={quantity}
        onChange={e => onQuantityChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="内容量（例: 500）"
        min={0}
        step="any"
        aria-label="内容量"
      />
      <select
        className={compact ? styles.compareNoteInput : styles.input}
        value={unit}
        onChange={e => onUnitChange(e.target.value)}
        aria-label="単位"
      >
        {UNITS.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
      </select>
    </div>
  )
}
