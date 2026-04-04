import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import styles from './ShoppingItemList.module.css'

export default function ShoppingItemList({ listId, listName, memberName }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at')
    if (!error && data) setItems(data)
    setLoading(false)
  }, [listId])

  useEffect(() => {
    setLoading(true)
    fetchItems()
  }, [fetchItems])

  // リアルタイム購読
  useEffect(() => {
    const channel = supabase
      .channel(`shopping_items_${listId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_items',
          filter: `list_id=eq.${listId}`,
        },
        () => fetchItems()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [listId, fetchItems])

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await supabase.from('shopping_items').insert({
      list_id: listId,
      name: name.trim(),
      memo: memo.trim() || null,
      added_by: memberName,
      checked: false,
    })
    setName('')
    setMemo('')
    setSubmitting(false)
  }

  async function handleToggle(item) {
    await supabase
      .from('shopping_items')
      .update({
        checked: !item.checked,
        checked_at: !item.checked ? new Date().toISOString() : null,
      })
      .eq('id', item.id)
  }

  async function handleDelete(id) {
    await supabase.from('shopping_items').delete().eq('id', id)
  }

  const unchecked = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)

  return (
    <div className={styles.container}>
      <h2 className={styles.listTitle}>{listName}</h2>

      <form onSubmit={handleAdd} className={styles.addForm}>
        <div className={styles.inputRow}>
          <input
            className={styles.nameInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="商品名を入力..."
            maxLength={100}
          />
          <input
            className={styles.memoInput}
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            maxLength={200}
          />
          <button
            type="submit"
            className={styles.addBtn}
            disabled={submitting || !name.trim()}
          >
            追加
          </button>
        </div>
      </form>

      {loading ? (
        <p className={styles.hint}>読み込み中...</p>
      ) : items.length === 0 ? (
        <p className={styles.hint}>アイテムがありません。最初の商品を追加してみましょう！</p>
      ) : (
        <div className={styles.itemsArea}>
          {unchecked.length > 0 && (
            <ul className={styles.itemList}>
              {unchecked.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}

          {checked.length > 0 && (
            <div className={styles.checkedSection}>
              <p className={styles.checkedSummary}>購入済み ({checked.length})</p>
              <ul className={styles.itemList}>
                {checked.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ItemRow({ item, onToggle, onDelete }) {
  return (
    <li className={`${styles.item} ${item.checked ? styles.itemChecked : ''}`}>
      <button
        className={styles.checkbox}
        onClick={() => onToggle(item)}
        aria-label={item.checked ? 'チェックを外す' : 'チェックする'}
      >
        {item.checked ? '✓' : ''}
      </button>
      <div className={styles.itemBody}>
        <span className={styles.itemName}>{item.name}</span>
        {item.memo && <span className={styles.itemMemo}>{item.memo}</span>}
        <span className={styles.itemAdded}>
          {item.added_by} が追加
          {item.checked && item.checked_at && ` · ${formatDate(item.checked_at)} 購入`}
        </span>
      </div>
      <button
        className={styles.deleteBtn}
        onClick={() => onDelete(item.id)}
        aria-label="削除"
      >
        ×
      </button>
    </li>
  )
}
