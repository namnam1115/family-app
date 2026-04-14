import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import styles from './ShoppingItemList.module.css'

export default function ShoppingItemList({ listId, listName, memberName, isFavorite, onToggleFavorite }) {
  const [items, setItems] = useState([])
  const [checkedItems, setCheckedItems] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .eq('checked', false)
      .order('created_at', { ascending: false })
      .limit(10)
    if (!error && data) setItems(data)
    setLoading(false)
  }, [listId])

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .eq('checked', true)
      .order('checked_at', { ascending: false })
      .limit(20)
    if (!error && data) setCheckedItems(data)
  }, [listId])

  useEffect(() => {
    setLoading(true)
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (showHistory) fetchHistory()
  }, [showHistory, fetchHistory])

  const showHistoryRef = useRef(showHistory)
  useEffect(() => { showHistoryRef.current = showHistory }, [showHistory])

  useEffect(() => {
    const channel = supabase
      .channel(`shopping_items_${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${listId}` }, () => {
        fetchItems()
        if (showHistoryRef.current) fetchHistory()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [listId, fetchItems, fetchHistory])

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
    fetchItems()
  }

  async function handleToggle(item) {
    const checked = !item.checked
    const checked_at = checked ? new Date().toISOString() : null
    if (checked) {
      // 未購入 → 購入済み: メインリストから除去
      setItems(prev => prev.filter(i => i.id !== item.id))
      if (showHistory) {
        setCheckedItems(prev => [{ ...item, checked: true, checked_at }, ...prev])
      }
    } else {
      // 購入済み → 未購入: 履歴から除去、メインリストに戻す
      setCheckedItems(prev => prev.filter(i => i.id !== item.id))
      fetchItems()
    }
    await supabase
      .from('shopping_items')
      .update({ checked, checked_at })
      .eq('id', item.id)
  }

  async function handleDelete(id) {
    setItems(prev => prev.filter(i => i.id !== id))
    setCheckedItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('shopping_items').delete().eq('id', id)
  }

  async function handleToggleImportant(item) {
    const important = !item.important
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, important } : i))
    setCheckedItems(prev => prev.map(i => i.id === item.id ? { ...i, important } : i))
    await supabase.from('shopping_items').update({ important }).eq('id', item.id)
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h2 className={styles.listTitle}>{listName}</h2>
        <button
          className={`${styles.favBtn} ${isFavorite ? styles.favOn : ''}`}
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'お気に入りを外す' : 'お気に入りに追加'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>

      {loading ? (
        <p className={styles.hint}>読み込み中...</p>
      ) : (
        <div className={styles.itemsArea}>
          {items.length === 0 && !showHistory && (
            <p className={styles.hint}>アイテムがありません。最初の商品を追加してみましょう！</p>
          )}
          {items.length > 0 && (
            <ul className={styles.itemList}>
              {items.map(item => (
                <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} onToggleImportant={handleToggleImportant} />
              ))}
            </ul>
          )}

          {/* 購入済み履歴トグル */}
          <button
            className={styles.historyToggle}
            onClick={() => setShowHistory(prev => !prev)}
          >
            <span className={styles.historyToggleIcon}>{showHistory ? '▲' : '▼'}</span>
            購入済み履歴
          </button>

          {showHistory && (
            <div className={styles.historySection}>
              {checkedItems.length === 0 ? (
                <p className={styles.historyEmpty}>購入済みのアイテムはありません</p>
              ) : (
                <ul className={styles.itemList}>
                  {checkedItems.map(item => (
                    <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} onToggleImportant={handleToggleImportant} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

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
          <button type="submit" className={styles.addBtn} disabled={submitting || !name.trim()}>
            追加
          </button>
        </div>
      </form>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const isToday = d.toDateString() === new Date().toDateString()
  if (isToday) return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const REVEAL_WIDTH = 80
const SWIPE_THRESHOLD = 40

function ItemRow({ item, onToggle, onDelete, onToggleImportant }) {
  const [offsetX, setOffsetX] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const touch = useRef({ startX: 0, startY: 0, horizontal: null, active: false, startOffset: 0 })

  function handleTouchStart(e) {
    touch.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      horizontal: null,
      active: true,
      startOffset: revealed ? -REVEAL_WIDTH : 0,
    }
  }

  function handleTouchMove(e) {
    const t = touch.current
    if (!t.active) return
    const dx = e.touches[0].clientX - t.startX
    const dy = e.touches[0].clientY - t.startY
    if (t.horizontal === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) t.horizontal = Math.abs(dx) >= Math.abs(dy)
      return
    }
    if (!t.horizontal) return
    const next = Math.max(Math.min(t.startOffset + dx, 0), -(REVEAL_WIDTH + 16))
    setOffsetX(next)
  }

  function handleTouchEnd() {
    touch.current.active = false
    if (offsetX <= -SWIPE_THRESHOLD) {
      setOffsetX(-REVEAL_WIDTH)
      setRevealed(true)
    } else {
      setOffsetX(0)
      setRevealed(false)
    }
  }

  function handleCheckboxClick(e) {
    e.stopPropagation()
    if (revealed) { closeReveal(); return }
    onToggle(item)
  }

  function handleItemClick() {
    if (revealed) closeReveal()
  }

  function closeReveal() {
    setOffsetX(0)
    setRevealed(false)
  }

  return (
    <li className={styles.itemWrapper}>
      {/* 削除ボタン（スワイプで露出） */}
      <button
        className={styles.deleteBgBtn}
        onClick={() => onDelete(item.id)}
        aria-label="削除"
      >
        削除
      </button>

      <div
        className={`${styles.item} ${item.checked ? styles.itemChecked : ''}`}
        style={{
          transform: offsetX !== 0 ? `translateX(${offsetX}px)` : undefined,
          transition: touch.current.active ? 'none' : 'transform 0.2s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleItemClick}
      >
        <button
          className={styles.checkbox}
          onClick={handleCheckboxClick}
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
        {/* 重要フラグ */}
        <button
          className={`${styles.starBtn} ${item.important ? styles.starOn : ''}`}
          onClick={e => { e.stopPropagation(); onToggleImportant(item) }}
          aria-label={item.important ? '重要フラグを外す' : '重要としてマーク'}
        >
          {item.important ? '⭐' : '☆'}
        </button>
        {/* デスクトップのみ × ボタン表示 */}
        <button className={styles.deleteBtn} onClick={e => { e.stopPropagation(); onDelete(item.id) }} aria-label="削除">×</button>
      </div>
    </li>
  )
}
