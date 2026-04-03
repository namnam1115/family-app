import { useState } from 'react'
import styles from './ShoppingListPanel.module.css'

export default function ShoppingListPanel({
  lists,
  selectedListId,
  loading,
  onSelect,
  onCreate,
  onDelete,
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSubmitting(true)
    await onCreate(newName.trim())
    setNewName('')
    setCreating(false)
    setSubmitting(false)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>リスト</span>
        <button className={styles.addBtn} onClick={() => setCreating(true)} title="新しいリスト">＋</button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className={styles.createForm}>
          <input
            className={styles.input}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="リスト名"
            maxLength={50}
            autoFocus
          />
          <div className={styles.formBtns}>
            <button type="button" className={styles.cancelBtn} onClick={() => { setCreating(false); setNewName('') }}>
              キャンセル
            </button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !newName.trim()}>
              {submitting ? '...' : '作成'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className={styles.hint}>読み込み中...</p>
      ) : lists.length === 0 && !creating ? (
        <p className={styles.hint}>リストがありません</p>
      ) : (
        <ul className={styles.list}>
          {lists.map(l => (
            <li
              key={l.id}
              className={`${styles.listItem} ${l.id === selectedListId ? styles.selected : ''}`}
            >
              <button className={styles.listBtn} onClick={() => onSelect(l.id)}>
                <span className={styles.listIcon}>📋</span>
                <span className={styles.listName}>{l.name}</span>
              </button>
              <button
                className={styles.deleteListBtn}
                onClick={e => { e.stopPropagation(); onDelete(l.id) }}
                title="削除"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
