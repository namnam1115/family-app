import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import ShoppingItemList from '../components/ShoppingItemList'
import NotificationSettings from '../components/NotificationSettings'
import styles from './ShoppingPage.module.css'

export default function ShoppingPage() {
  const navigate = useNavigate()
  const { familyMember } = useAuth()
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState(null)
  const [loadingLists, setLoadingLists] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showNotifSettings, setShowNotifSettings] = useState(false)

  const fetchLists = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, created_at, created_by, is_favorite')
      .eq('family_id', familyMember.family_id)
      .order('created_at', { ascending: false })
    if (!error && data) {
      const { data: uncheckedItems } = await supabase
        .from('shopping_items')
        .select('list_id')
        .in('list_id', data.map(l => l.id))
        .eq('checked', false)
      const countMap = {}
      if (uncheckedItems) {
        uncheckedItems.forEach(item => {
          countMap[item.list_id] = (countMap[item.list_id] || 0) + 1
        })
      }
      const withCounts = data.map(l => ({ ...l, uncheckedCount: countMap[l.id] || 0 }))
      // お気に入り優先、同条件内は未購入数の多い順
      withCounts.sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
        return b.uncheckedCount - a.uncheckedCount
      })
      setLists(withCounts)
    }
    setLoadingLists(false)
  }, [familyMember?.family_id])

  useEffect(() => {
    if (lists.length > 0 && !selectedListId) {
      setSelectedListId(lists[0].id)
    }
  }, [lists, selectedListId])

  useEffect(() => { fetchLists() }, [fetchLists])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const channel = supabase
      .channel('shopping_lists_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists', filter: `family_id=eq.${familyMember.family_id}` }, fetchLists)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [familyMember?.family_id, fetchLists])

  async function handleCreateList(name) {
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({ family_id: familyMember.family_id, name, created_by: familyMember.user_id })
      .select()
      .single()
    if (!error && data) {
      await fetchLists()
      setSelectedListId(data.id)
    }
  }

  async function handleToggleFavorite(listId) {
    const list = lists.find(l => l.id === listId)
    if (!list) return
    const is_favorite = !list.is_favorite
    setLists(prev => {
      const updated = prev.map(l => l.id === listId ? { ...l, is_favorite } : l)
      updated.sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
        return b.uncheckedCount - a.uncheckedCount
      })
      return updated
    })
    const { error } = await supabase.from('shopping_lists').update({ is_favorite }).eq('id', listId)
    if (error) {
      console.error('お気に入り更新エラー:', error)
      // ロールバック
      setLists(prev => {
        const rolled = prev.map(l => l.id === listId ? { ...l, is_favorite: !is_favorite } : l)
        rolled.sort((a, b) => {
          if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
          return b.uncheckedCount - a.uncheckedCount
        })
        return rolled
      })
    }
  }

  async function handleDeleteList(listId) {
    await supabase.from('shopping_lists').delete().eq('id', listId)
    if (selectedListId === listId) {
      setSelectedListId(lists.find(l => l.id !== listId)?.id ?? null)
    }
  }

  const selectedList = lists.find(l => l.id === selectedListId)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
        <h1 className={styles.headerTitle}>🛒 買い物リスト</h1>
        <button
          className={styles.notifBtn}
          onClick={() => setShowNotifSettings(true)}
          aria-label="通知設定"
          title="通知設定"
        >🔔</button>
      </header>

      <div className={styles.body}>
        {/* リスト選択タブ */}
        <div className={styles.tabsBar}>
          {loadingLists ? (
            <span className={styles.tabsLoading}>読み込み中...</span>
          ) : (
            <div className={styles.tabsScroll}>
              {lists.map(l => (
                <button
                  key={l.id}
                  className={`${styles.tab} ${l.id === selectedListId ? styles.tabActive : ''}`}
                  onClick={() => setSelectedListId(l.id)}
                >
                  <span className={styles.tabName}>{l.name}</span>
                  <span
                    className={styles.tabDelete}
                    onClick={e => { e.stopPropagation(); handleDeleteList(l.id) }}
                    role="button"
                    aria-label={`${l.name}を削除`}
                  >×</span>
                </button>
              ))}
              <button className={styles.tabNew} onClick={() => setShowCreate(true)}>
                ＋ 新しいリスト
              </button>
            </div>
          )}
        </div>

        {/* コンテンツ */}
        <main className={styles.content}>
          {selectedListId ? (
            <ShoppingItemList
              listId={selectedListId}
              listName={selectedList?.name}
              memberName={familyMember?.name || familyMember?.email || '名前なし'}
              isFavorite={selectedList?.is_favorite ?? false}
              onToggleFavorite={() => handleToggleFavorite(selectedListId)}
            />
          ) : (
            !loadingLists && (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>🛒</span>
                <p>「＋ 新しいリスト」からリストを作成してください</p>
              </div>
            )
          )}
        </main>
      </div>

      {showNotifSettings && (
        <NotificationSettings
          familyMember={familyMember}
          onClose={() => setShowNotifSettings(false)}
        />
      )}

      {showCreate && (
        <CreateListModal
          onSubmit={async (name) => { await handleCreateList(name); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

function CreateListModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onSubmit(name.trim())
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>新しいリスト</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <input
            className={styles.modalInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="リスト名を入力..."
            maxLength={50}
            autoFocus
          />
          <div className={styles.modalBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
