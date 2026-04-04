import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import ShoppingItemList from '../components/ShoppingItemList'
import styles from './ShoppingPage.module.css'

export default function ShoppingPage() {
  const navigate = useNavigate()
  const { familyMember } = useAuth()
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState(null)
  const [loadingLists, setLoadingLists] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const fetchLists = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, created_at, created_by')
      .eq('family_id', familyMember.family_id)
      .order('created_at', { ascending: false })
    if (!error && data) setLists(data)
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
        <button className={styles.backBtn} onClick={() => navigate('/')}>← ホーム</button>
        <h1 className={styles.headerTitle}>🛒 買い物リスト</h1>
      </header>

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
