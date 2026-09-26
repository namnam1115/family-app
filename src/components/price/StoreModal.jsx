import { useState } from 'react'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'
import styles from './Price.module.css'

// ── 店舗管理モーダル ──────────────────────────────────────
export default function StoreModal({ stores, onAdd, onDelete, onClose }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setError('')
    const err = await onAdd(newName)
    if (err) setError('追加に失敗しました（同名の店舗が既に存在する可能性があります）')
    else setNewName('')
    setAdding(false)
  }

  return (
    <>
      <Modal open onClose={onClose} title="店舗管理">
      <ul className={styles.storeList}>
        {stores.length === 0 && (
          <li className={styles.storeEmpty}>店舗が登録されていません</li>
        )}
        {stores.map(s => (
          <li key={s.id} className={styles.storeItem}>
            <span className={styles.storeName}>{s.name}</span>
            <button
              className={styles.storeDeleteBtn}
              onClick={() => setDeleteTarget(s)}
              aria-label={`${s.name}を削除`}
            >削除</button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleAdd} className={styles.storeAddForm}>
        <input
          className={styles.input}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="新しい店舗名を入力..."
          maxLength={50}
          autoComplete="off"
        />
        <button type="submit" className={styles.saveBtn} disabled={adding || !newName.trim()}>
          追加
        </button>
      </form>
      {error && <p className={styles.errorMsg}>{error}</p>}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`「${deleteTarget?.name}」を削除しますか？登録済みの価格データもすべて削除されます。`}
        confirmLabel="削除する"
        onConfirm={() => { onDelete(deleteTarget.id, deleteTarget.name); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
