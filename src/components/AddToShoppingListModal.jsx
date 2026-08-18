import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import styles from './AddToShoppingListModal.module.css'

/**
 * 他アプリ（価格比較・おかず・在庫など）から買い物リストへ品物を送る共通モーダル。
 *
 * props:
 *   items        : [{ key, name, memo? }] 追加候補。key は一意ならなんでもよい
 *   familyMember : useAuth() の familyMember（family_id / name を使う）
 *   title        : 見出し（既定「買い物リストに追加」）
 *   onAdded      : 追加成功時（追加件数を受け取る）
 *   onClose      : 閉じる
 */
export default function AddToShoppingListModal({
  items,
  familyMember,
  title = '買い物リストに追加',
  onAdded,
  onClose,
}) {
  const [lists, setLists] = useState([])
  const [targetListId, setTargetListId] = useState('')
  const [selected, setSelected] = useState(() => new Set(items.map(i => i.key)))
  const [loadingLists, setLoadingLists] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function fetchLists() {
      const familyId = familyMember?.family_id
      if (!familyId) return
      const { data, error: err } = await supabase
        .from('shopping_lists')
        .select('id, name, is_favorite')
        .eq('family_id', familyId)
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (err) {
        console.error('買い物リスト取得エラー:', err)
        setError('買い物リストを取得できませんでした')
      } else {
        setLists(data ?? [])
        setTargetListId(data?.[0]?.id ?? '')
      }
      setLoadingLists(false)
    }
    fetchLists()
    return () => { cancelled = true }
  }, [familyMember?.family_id])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleAdd() {
    if (!targetListId || selected.size === 0) return
    setSubmitting(true)
    setError('')
    const rows = items
      .filter(i => selected.has(i.key))
      .map(i => ({
        list_id: targetListId,
        name: i.name,
        memo: i.memo || null,
        added_by: familyMember?.name ?? null,
        checked: false,
      }))
    const { error: err } = await supabase.from('shopping_items').insert(rows)
    setSubmitting(false)
    if (err) {
      console.error('買い物リスト追加エラー:', err)
      setError('買い物リストへの追加に失敗しました。もう一度お試しください。')
      return
    }
    onAdded?.(rows.length)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className={styles.body}>
        <label className={styles.label} htmlFor="add-to-shopping-list">追加先リスト</label>
        {loadingLists ? (
          <p className={styles.note}>読み込み中...</p>
        ) : lists.length === 0 ? (
          <p className={styles.note}>買い物リストがまだありません。先に買い物リストを作成してください。</p>
        ) : (
          <select
            id="add-to-shopping-list"
            className={styles.select}
            value={targetListId}
            onChange={e => setTargetListId(e.target.value)}
          >
            {lists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        )}

        {items.length > 1 && (
          <>
            <span className={styles.label}>追加する品物</span>
            <div className={styles.itemList}>
              {items.map(item => (
                <label key={item.key} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    onChange={() => toggle(item.key)}
                  />
                  <span className={styles.itemName}>{item.name}</span>
                  {item.memo && <span className={styles.itemMemo}>{item.memo}</span>}
                </label>
              ))}
            </div>
          </>
        )}

        {items.length === 1 && items[0].memo && (
          <p className={styles.note}>メモ: {items[0].memo}</p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.btns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
            キャンセル
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleAdd}
            disabled={submitting || !targetListId || selected.size === 0}
          >
            {submitting ? '追加中...' : `${selected.size}件を追加`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
