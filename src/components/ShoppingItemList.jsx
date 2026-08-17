import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { IconStar, IconStarFill, IconCheck, IconEdit } from '../lib/icons'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'
import styles from './ShoppingItemList.module.css'

const ITEMS_PAGE_SIZE = 10
const HISTORY_PAGE_SIZE = 20

export default function ShoppingItemList({ listId, listName, memberName, isFavorite, onToggleFavorite }) {
  const [items, setItems] = useState([])
  const [checkedItems, setCheckedItems] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [toast, setToast] = useState(null)
  const [pastNames, setPastNames] = useState([])
  const [nameFocused, setNameFocused] = useState(false)

  const [itemsLimit, setItemsLimit] = useState(ITEMS_PAGE_SIZE)
  const [hasMoreItems, setHasMoreItems] = useState(false)
  const [loadingMoreItems, setLoadingMoreItems] = useState(false)

  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false)

  const fetchItems = useCallback(async (limit) => {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .eq('checked', false)
      .order('important', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit + 1)
    if (!error && data) {
      setHasMoreItems(data.length > limit)
      setItems(data.slice(0, limit))
    }
  }, [listId])

  const fetchHistory = useCallback(async (limit) => {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .eq('checked', true)
      .order('checked_at', { ascending: false })
      .limit(limit + 1)
    if (!error && data) {
      setHasMoreHistory(data.length > limit)
      setCheckedItems(data.slice(0, limit))
    }
  }, [listId])

  useEffect(() => {
    setLoading(true)
    setItemsLimit(ITEMS_PAGE_SIZE)
    fetchItems(ITEMS_PAGE_SIZE).finally(() => setLoading(false))
  }, [fetchItems])

  // よく買う商品のサジェスト用: このリストの過去のアイテム名を頻度順に取得
  useEffect(() => {
    async function fetchPastNames() {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('name')
        .eq('list_id', listId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!error && data) {
        const counts = {}
        data.forEach(({ name }) => { counts[name] = (counts[name] || 0) + 1 })
        setPastNames(Object.keys(counts).sort((a, b) => counts[b] - counts[a]))
      }
    }
    fetchPastNames()
  }, [listId])

  useEffect(() => {
    if (showHistory) {
      setHistoryLimit(HISTORY_PAGE_SIZE)
      fetchHistory(HISTORY_PAGE_SIZE)
    }
  }, [showHistory, fetchHistory])

  const showHistoryRef = useRef(showHistory)
  useEffect(() => { showHistoryRef.current = showHistory }, [showHistory])
  const itemsLimitRef = useRef(itemsLimit)
  useEffect(() => { itemsLimitRef.current = itemsLimit }, [itemsLimit])
  const historyLimitRef = useRef(historyLimit)
  useEffect(() => { historyLimitRef.current = historyLimit }, [historyLimit])

  useEffect(() => {
    const channel = supabase
      .channel(`shopping_items_${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${listId}` }, () => {
        fetchItems(itemsLimitRef.current)
        if (showHistoryRef.current) fetchHistory(historyLimitRef.current)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [listId, fetchItems, fetchHistory])

  async function handleLoadMoreItems() {
    const next = itemsLimit + ITEMS_PAGE_SIZE
    setLoadingMoreItems(true)
    await fetchItems(next)
    setItemsLimit(next)
    setLoadingMoreItems(false)
  }

  async function handleLoadMoreHistory() {
    const next = historyLimit + HISTORY_PAGE_SIZE
    setLoadingMoreHistory(true)
    await fetchHistory(next)
    setHistoryLimit(next)
    setLoadingMoreHistory(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    const isDuplicate = items.some(i => i.name.trim().toLowerCase() === trimmedName.toLowerCase())
    if (isDuplicate) {
      setToast({ message: `「${trimmedName}」はすでにリストにあります`, variant: 'error' })
      return
    }
    const trimmedMemo = memo.trim()
    setSubmitting(true)
    setName('')
    setMemo('')

    // 楽観的追加: 重要フラグ付きアイテムの後ろ・未購入リストの先頭に挿入
    const tempId = `temp-${Date.now()}`
    const optimisticItem = {
      id: tempId,
      list_id: listId,
      name: trimmedName,
      memo: trimmedMemo || null,
      added_by: memberName,
      checked: false,
      important: false,
      created_at: new Date().toISOString(),
    }
    setItems(prev => {
      const insertAt = prev.findIndex(i => !i.important)
      const idx = insertAt === -1 ? prev.length : insertAt
      return [...prev.slice(0, idx), optimisticItem, ...prev.slice(idx)]
    })

    const { data, error } = await supabase
      .from('shopping_items')
      .insert({
        list_id: listId,
        name: trimmedName,
        memo: trimmedMemo || null,
        added_by: memberName,
        checked: false,
      })
      .select()
      .single()

    if (error || !data) {
      console.error('アイテム追加エラー:', error)
      setItems(prev => prev.filter(i => i.id !== tempId))
      setToast({ message: '追加に失敗しました。通信環境を確認してください。', variant: 'error' })
    } else {
      setItems(prev => prev.map(i => i.id === tempId ? data : i))
    }
    setSubmitting(false)
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
      fetchItems(itemsLimitRef.current)
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
    setItems(prev => {
      const updated = prev.map(i => i.id === item.id ? { ...i, important } : i)
      updated.sort((a, b) => {
        if (a.important !== b.important) return a.important ? -1 : 1
        return new Date(b.created_at) - new Date(a.created_at)
      })
      return updated
    })
    setCheckedItems(prev => prev.map(i => i.id === item.id ? { ...i, important } : i))
    const { error } = await supabase.from('shopping_items').update({ important }).eq('id', item.id)
    if (error) {
      console.error('重要フラグ更新エラー:', error)
      setToast({ message: '重要フラグの更新に失敗しました。', variant: 'error' })
    }
  }

  async function handleEditSubmit(id, { name: newName, memo: newMemo }) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, name: newName, memo: newMemo || null } : i))
    setCheckedItems(prev => prev.map(i => i.id === id ? { ...i, name: newName, memo: newMemo || null } : i))
    const { error } = await supabase
      .from('shopping_items')
      .update({ name: newName, memo: newMemo || null })
      .eq('id', id)
    if (error) {
      console.error('アイテム編集エラー:', error)
      setToast({ message: '編集の保存に失敗しました。通信環境を確認してください。', variant: 'error' })
      fetchItems(itemsLimitRef.current)
      if (showHistory) fetchHistory(historyLimitRef.current)
    }
    setEditingItem(null)
  }

  async function handleClearHistory() {
    setConfirmClearHistory(false)
    const prevChecked = checkedItems
    setCheckedItems([])
    setHasMoreHistory(false)
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('list_id', listId)
      .eq('checked', true)
    if (error) {
      console.error('購入済み履歴の削除エラー:', error)
      setToast({ message: '履歴の削除に失敗しました。通信環境を確認してください。', variant: 'error' })
      setCheckedItems(prevChecked)
    }
  }

  const nameInputValue = name.trim()
  const suggestions = nameInputValue
    ? pastNames
      .filter(n =>
        n.toLowerCase().includes(nameInputValue.toLowerCase()) &&
        n !== nameInputValue &&
        !items.some(i => i.name === n)
      )
      .slice(0, 5)
    : []

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h2 className={styles.listTitle}>{listName}</h2>
        <button
          className={`${styles.favBtn} ${isFavorite ? styles.favOn : ''}`}
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'お気に入りを外す' : 'お気に入りに追加'}
        >
          {isFavorite ? <IconStarFill /> : <IconStar />}
        </button>
      </div>

      {loading ? (
        <div className={styles.itemsArea}>
          <ul className={styles.itemList} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className={styles.skeletonRow} />
            ))}
          </ul>
        </div>
      ) : (
        <div className={styles.itemsArea}>
          {items.length === 0 && !showHistory && (
            <p className={styles.hint}>アイテムがありません。最初の商品を追加してみましょう！</p>
          )}
          {items.length > 0 && (
            <>
              <ul className={styles.itemList}>
                {items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onToggleImportant={handleToggleImportant}
                    onEdit={setEditingItem}
                  />
                ))}
              </ul>
              {hasMoreItems && (
                <button
                  className={styles.loadMoreBtn}
                  onClick={handleLoadMoreItems}
                  disabled={loadingMoreItems}
                >
                  {loadingMoreItems ? '読み込み中...' : 'もっと見る'}
                </button>
              )}
            </>
          )}

          {/* 購入済み履歴トグル */}
          <div className={styles.historyHeader}>
            <button
              className={styles.historyToggle}
              onClick={() => setShowHistory(prev => !prev)}
            >
              <span className={styles.historyToggleIcon}>{showHistory ? '▲' : '▼'}</span>
              購入済み履歴
            </button>
            {showHistory && checkedItems.length > 0 && (
              <button
                className={styles.clearHistoryBtn}
                onClick={() => setConfirmClearHistory(true)}
              >
                すべて削除
              </button>
            )}
          </div>

          {showHistory && (
            <div className={styles.historySection}>
              {checkedItems.length === 0 ? (
                <p className={styles.historyEmpty}>購入済みのアイテムはありません</p>
              ) : (
                <>
                  <ul className={styles.itemList}>
                    {checkedItems.map(item => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onToggleImportant={handleToggleImportant}
                        onEdit={setEditingItem}
                      />
                    ))}
                  </ul>
                  {hasMoreHistory && (
                    <button
                      className={styles.loadMoreBtn}
                      onClick={handleLoadMoreHistory}
                      disabled={loadingMoreHistory}
                    >
                      {loadingMoreHistory ? '読み込み中...' : 'もっと見る'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleAdd} className={styles.addForm}>
        {nameFocused && suggestions.length > 0 && (
          <div className={styles.suggestions} role="listbox" aria-label="よく買う商品の候補">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                className={styles.suggestionChip}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setName(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className={styles.inputRow}>
          <input
            className={styles.nameInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
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

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSubmit={data => handleEditSubmit(editingItem.id, data)}
          onClose={() => setEditingItem(null)}
        />
      )}

      <ConfirmDialog
        open={confirmClearHistory}
        title="購入済み履歴を削除しますか？"
        message="購入済みのアイテムがすべて削除されます。この操作は取り消せません。"
        confirmLabel="削除する"
        onConfirm={handleClearHistory}
        onCancel={() => setConfirmClearHistory(false)}
      />

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
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

function ItemRow({ item, onToggle, onDelete, onToggleImportant, onEdit }) {
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
        style={{ opacity: Math.min(Math.abs(offsetX) / REVEAL_WIDTH, 1) }}
        onClick={() => onDelete(item.id)}
        aria-label="削除"
      >
        削除
      </button>

      <div
        className={`${styles.item} ${item.checked ? styles.itemChecked : ''} ${item.important && !item.checked ? styles.itemImportant : ''}`}
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
          {item.checked ? <IconCheck /> : ''}
        </button>
        <div className={styles.itemBody}>
          <span className={styles.itemName}>{item.name}</span>
          {item.memo && <span className={styles.itemMemo}>{item.memo}</span>}
          <span className={styles.itemAdded}>
            {item.added_by} が追加
            {item.checked && item.checked_at && ` · ${formatDate(item.checked_at)} 購入`}
          </span>
        </div>
        {/* 編集 */}
        <button
          className={styles.editItemBtn}
          onClick={e => { e.stopPropagation(); onEdit(item) }}
          aria-label="編集"
        ><IconEdit /></button>
        {/* 重要フラグ */}
        <button
          className={`${styles.starBtn} ${item.important ? styles.starOn : ''}`}
          onClick={e => { e.stopPropagation(); onToggleImportant(item) }}
          aria-label={item.important ? '重要フラグを外す' : '重要としてマーク'}
        >
          {item.important ? <IconStarFill /> : <IconStar />}
        </button>
        {/* デスクトップのみ × ボタン表示 */}
        <button className={styles.deleteBtn} onClick={e => { e.stopPropagation(); onDelete(item.id) }} aria-label="削除">×</button>
      </div>
    </li>
  )
}

function EditItemModal({ item, onSubmit, onClose }) {
  const [name, setName] = useState(item.name)
  const [memo, setMemo] = useState(item.memo || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onSubmit({ name: name.trim(), memo: memo.trim() })
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>アイテムを編集</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <input
            className={styles.modalInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="商品名を入力..."
            maxLength={100}
            autoFocus
          />
          <input
            className={styles.modalInput}
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            maxLength={200}
          />
          <div className={styles.modalBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
