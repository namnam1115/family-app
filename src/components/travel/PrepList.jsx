import { useMemo, useRef, useState } from 'react'
import { IconCheck, IconTrash } from '../../lib/icons'
import { PREP_CATEGORIES } from '../../lib/travel'
import styles from './Travel.module.css'

/**
 * 出発前の準備リスト（持ち物 / やること）。
 *
 * props:
 *   items    : travel_prep_items の配列（この旅行の分だけ）
 *   onAdd    : ({ category, title, assignee }) => Promise
 *   onToggle : (item) => void
 *   onDelete : (item) => void
 */
export default function PrepList({ items, members = [], onAdd, onToggle, onDelete }) {
  const [category, setCategory] = useState('packing')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const [showAssignee, setShowAssignee] = useState(false)
  const titleRef = useRef(null)
  const submittingRef = useRef(false)

  const groups = useMemo(
    () => PREP_CATEGORIES.map(cat => ({
      ...cat,
      items: items.filter(item => item.category === cat.key),
    })),
    [items]
  )

  const doneCount = items.filter(item => item.done).length
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0

  async function handleAdd(e) {
    e.preventDefault()
    if (submittingRef.current) return
    if (!title.trim()) { setError('項目名を入力してください'); return }
    setError('')
    submittingRef.current = true
    setSubmitting(true)
    try {
      await onAdd({ category, title: title.trim(), assignee: assignee.trim() || null })
      setTitle('')
    } catch (err) {
      console.error('準備項目の追加エラー:', err)
      setError('追加できませんでした。もう一度お試しください')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
      requestAnimationFrame(() => titleRef.current?.focus())
    }
  }

  return (
    <div>
      <div className={styles.prepHead}>
        <div className={styles.costRow}>
          <span>準備の進み具合</span>
          <span className={styles.costValue}>{doneCount} / {items.length}</span>
        </div>
        <div className={styles.meter} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="準備の進み具合">
          <div className={styles.meterFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form className={styles.addForm} onSubmit={handleAdd}>
        <div className={styles.segment}>
          {PREP_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              type="button"
              className={styles.segmentBtn}
              aria-pressed={category === cat.key}
              disabled={submitting}
              onClick={() => setCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className={styles.inlineRow}>
          <input
            ref={titleRef}
            aria-label="準備するもの・やること"
            maxLength={200}
            disabled={submitting}
            type="text"
            className={styles.input}
            placeholder={category === 'packing' ? '例：充電器' : '例：レンタカーを予約する'}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault() }}
          />
          <button type="submit" className={styles.addBtn} disabled={submitting || !title.trim()}>{submitting ? '追加中…' : '＋ 追加'}</button>
        </div>
        <button type="button" className={styles.textBtn} aria-expanded={showAssignee} onClick={() => setShowAssignee(v => !v)}>{showAssignee ? '− 担当を閉じる' : `＋ 担当をつける${assignee ? `（${assignee}）` : ''}`}</button>
        {showAssignee && (members.length > 0 ? (
          <select className={styles.select} aria-label="担当" value={assignee} disabled={submitting} onChange={e => setAssignee(e.target.value)}>
            <option value="">担当なし</option>
            {members.map(member => <option key={member.id} value={member.name}>{member.name || 'メンバー'}</option>)}
          </select>
        ) : (
        <input
            type="text"
            className={styles.input}
            placeholder="担当（任意）"
            aria-label="担当"
            maxLength={50}
            disabled={submitting}
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault() }}
          />
        ))}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>

      <div className={styles.prepToolbar}>
        <span>{items.length ? (doneCount === items.length ? '準備が整いました！' : `残り${items.length - doneCount}件の準備`) : '持ち物と出発前のやることをまとめましょう'}</span>
        {doneCount > 0 && <button type="button" aria-pressed={hideDone} className={styles.textBtn} onClick={() => setHideDone(v => !v)}>{hideDone ? '完了分を表示' : '完了分を隠す'}</button>}
      </div>
      {groups.map(group => (
        <div key={group.key} className={styles.prepGroup}>
          <h4 className={styles.groupTitle}>
            {group.label}
            <span className={styles.groupCount}>
              {group.items.length ? `${group.items.filter(i => i.done).length} / ${group.items.length}` : '0件'}
            </span>
          </h4>
          {group.items.length === 0 && <p className={styles.groupEmpty}>{group.label}はまだありません</p>}
          {group.items.filter(item => !hideDone || !item.done).map(item => (
            <div key={item.id} className={`${styles.prepItem} ${item.done ? styles.prepDone : ''}`}>
              <button
                type="button"
                className={styles.doneBtn}
                aria-pressed={!!item.done}
                aria-label={item.done ? `${item.title} のチェックを外す` : `${item.title} をチェックする`}
                onClick={() => onToggle(item)}
              >
                <IconCheck />
              </button>
              <span className={styles.prepTitle}>{item.title}</span>
              {item.assignee && <span className={styles.assignee}>{item.assignee}</span>}
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`${item.title} を削除`}
                onClick={() => onDelete(item)}
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      ))}


    </div>
  )
}
