import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconShopping, IconList, IconClose } from '../lib/icons'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import EmptyState from '../components/EmptyState'
import ErrorNotice from '../components/ErrorNotice'
import Toast from '../components/Toast'
import styles from './QuickAddPage.module.css'

const LAST_LIST_KEY = 'quickAdd.lastListId'

function loadLastListId() {
  try { return localStorage.getItem(LAST_LIST_KEY) } catch { return null }
}

function saveLastListId(id) {
  try { localStorage.setItem(LAST_LIST_KEY, id) } catch { /* 保存できなくても動作に支障はない */ }
}

// 音声入力やメモからの貼り付けで「牛乳、卵、パン」とまとめて入れられるようにする
function splitNames(text) {
  const seen = new Set()
  return text.split(/[\n、,，]/).map(s => s.trim()).filter(s => {
    const key = s.toLowerCase()
    if (!s || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * ホーム画面アイコンのショートカット（manifest の shortcuts）から開く、買い物リストへの連続追加専用画面。
 * 入力欄にフォーカスしたまま Enter で次々に追加できる。
 */
export default function QuickAddPage() {
  const navigate = useNavigate()
  const { familyMember } = useAuth()
  const [lists, setLists] = useState([])
  const [listId, setListId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState('')
  const [added, setAdded] = useState([]) // この画面で追加した品物（新しい順）
  const [toast, setToast] = useState(null)
  const existingNamesRef = useRef(new Set())
  const inputRef = useRef(null)

  const familyId = familyMember?.family_id
  const memberName = familyMember?.name || familyMember?.email || '名前なし'

  const fetchLists = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, is_favorite')
      .eq('family_id', familyId)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      console.error('買い物リスト取得エラー:', error)
      setLoadError(true)
      return
    }
    setLoadError(false)
    setLists(data ?? [])
    const lastId = loadLastListId()
    setListId(data?.some(l => l.id === lastId) ? lastId : data?.[0]?.id ?? '')
  }, [familyId])

  useEffect(() => { fetchLists() }, [fetchLists])

  // 重複追加防止用に、選択中リストの未購入アイテム名を持っておく
  useEffect(() => {
    if (!listId) return
    let cancelled = false
    existingNamesRef.current = new Set()
    supabase
      .from('shopping_items')
      .select('name')
      .eq('list_id', listId)
      .eq('checked', false)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('買い物アイテム取得エラー:', error)
          return
        }
        existingNamesRef.current = new Set((data ?? []).map(i => i.name.trim().toLowerCase()))
      })
    return () => { cancelled = true }
  }, [listId])

  function handleChangeList(id) {
    setListId(id)
    saveLastListId(id)
    inputRef.current?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!listId) return
    const names = splitNames(text)
    if (names.length === 0) return

    const existing = existingNamesRef.current
    const newNames = names.filter(n => !existing.has(n.toLowerCase()))
    const skipped = names.length - newNames.length
    if (newNames.length === 0) {
      setToast({ message: `「${names.join('、')}」はすでにリストにあります`, variant: 'error' })
      return
    }

    // 通信を待たずに入力欄を空け、続けて次の品物を打てるようにする。
    // 送信中の品物も重複判定に含めて、連打による二重追加を防ぐ
    setText('')
    inputRef.current?.focus()
    newNames.forEach(n => existing.add(n.toLowerCase()))
    const listName = lists.find(l => l.id === listId)?.name ?? ''
    const { data, error } = await supabase
      .from('shopping_items')
      .insert(newNames.map(name => ({ list_id: listId, name, added_by: memberName, checked: false })))
      .select('id, name')

    if (error || !data) {
      console.error('アイテム追加エラー:', error)
      newNames.forEach(n => existing.delete(n.toLowerCase()))
      setText(prev => prev || newNames.join('、'))
      setToast({ message: `「${newNames.join('、')}」を追加できませんでした。通信環境を確認してください。`, variant: 'error' })
      return
    }
    setAdded(prev => [...data.map(i => ({ ...i, listName })).reverse(), ...prev])
    if (skipped > 0) {
      setToast({ message: `${skipped}件はすでにリストにあるため追加しませんでした`, variant: 'default' })
    }
  }

  async function handleUndo(item) {
    setAdded(prev => prev.filter(i => i.id !== item.id))
    const { error } = await supabase.from('shopping_items').delete().eq('id', item.id)
    if (error) {
      console.error('アイテム削除エラー:', error)
      setAdded(prev => [item, ...prev])
      setToast({ message: '取り消しに失敗しました。通信環境を確認してください。', variant: 'error' })
      return
    }
    existingNamesRef.current.delete(item.name.toLowerCase())
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}><IconShopping className={styles.headerTitleIcon} /> すばやく追加</h1>
        <button
          className={styles.listBtn}
          onClick={() => navigate('/shopping')}
          aria-label="買い物リストを開く"
          title="買い物リストを開く"
        ><IconList /></button>
      </header>

      <main className={styles.content}>
        {loading ? (
          <p className={styles.note}>読み込み中...</p>
        ) : loadError ? (
          <ErrorNotice onRetry={fetchLists} />
        ) : lists.length === 0 ? (
          <EmptyState
            icon={<IconShopping />}
            title="買い物リストがまだありません"
            description="先に買い物リストを作成してください。"
            actionLabel="買い物リストへ"
            onAction={() => navigate('/shopping')}
          />
        ) : (
          <>
            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="quick-add-list">追加先</label>
              <select
                id="quick-add-list"
                className={styles.select}
                value={listId}
                onChange={e => handleChangeList(e.target.value)}
              >
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <div className={styles.inputRow}>
                <input
                  ref={inputRef}
                  className={styles.input}
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="品物名（「、」区切りでまとめて）"
                  aria-label="追加する品物名"
                  enterKeyHint="send"
                  autoComplete="off"
                  maxLength={200}
                  autoFocus
                />
                <button type="submit" className={styles.addBtn} disabled={!text.trim()}>追加</button>
              </div>
            </form>

            {added.length > 0 ? (
              <section className={styles.added} aria-label="追加した品物">
                <p className={styles.addedTitle}>追加しました（{added.length}件）</p>
                <ul className={styles.addedList}>
                  {added.map(item => (
                    <li key={item.id} className={styles.addedItem}>
                      <span className={styles.addedName}>{item.name}</span>
                      <span className={styles.addedListName}>{item.listName}</span>
                      <button
                        type="button"
                        className={styles.undoBtn}
                        onClick={() => handleUndo(item)}
                        aria-label={`「${item.name}」の追加を取り消す`}
                      ><IconClose /></button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className={styles.note}>入力して Enter で、続けてどんどん追加できます</p>
            )}
          </>
        )}
      </main>

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
