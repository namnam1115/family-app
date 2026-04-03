import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import ShoppingListPanel from '../components/ShoppingListPanel'
import ShoppingItemList from '../components/ShoppingItemList'
import styles from './ShoppingPage.module.css'

export default function ShoppingPage() {
  const navigate = useNavigate()
  const { familyMember } = useAuth()
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState(null)
  const [loadingLists, setLoadingLists] = useState(true)

  const fetchLists = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, created_at, created_by')
      .eq('family_id', familyMember.family_id)
      .order('created_at', { ascending: false })
    if (!error && data) {
      setLists(data)
      if (data.length > 0 && !selectedListId) {
        setSelectedListId(data[0].id)
      }
    }
    setLoadingLists(false)
  }, [familyMember?.family_id, selectedListId])

  useEffect(() => {
    fetchLists()
  }, [fetchLists])

  // リアルタイム購読
  useEffect(() => {
    if (!familyMember?.family_id) return
    const channel = supabase
      .channel('shopping_lists_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_lists',
          filter: `family_id=eq.${familyMember.family_id}`,
        },
        () => fetchLists()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [familyMember?.family_id, fetchLists])

  async function handleCreateList(name) {
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({
        family_id: familyMember.family_id,
        name,
        created_by: familyMember.user_id,
      })
      .select()
      .single()
    if (!error && data) {
      setSelectedListId(data.id)
    }
  }

  async function handleDeleteList(listId) {
    await supabase.from('shopping_lists').delete().eq('id', listId)
    if (selectedListId === listId) {
      setSelectedListId(lists.find(l => l.id !== listId)?.id ?? null)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>← ホーム</button>
        <h1 className={styles.headerTitle}>🛒 買い物リスト</h1>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <ShoppingListPanel
            lists={lists}
            selectedListId={selectedListId}
            loading={loadingLists}
            onSelect={setSelectedListId}
            onCreate={handleCreateList}
            onDelete={handleDeleteList}
          />
        </aside>
        <main className={styles.content}>
          {selectedListId ? (
            <ShoppingItemList
              listId={selectedListId}
              listName={lists.find(l => l.id === selectedListId)?.name}
              memberName={familyMember?.name || familyMember?.email || '名前なし'}
            />
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>🛒</span>
              <p>リストを選択するか、新しいリストを作成してください</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
