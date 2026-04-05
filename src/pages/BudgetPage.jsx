import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import styles from './BudgetPage.module.css'

export default function BudgetPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [entries, setEntries] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('category')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(null) // null | true | categoryId string
  const [editEntry, setEditEntry] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!familyMember?.family_id) return
    const fid = familyMember.family_id
    const [{ data: cats }, { data: ents }, { data: mems }] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('family_id', fid).order('sort_order').order('created_at'),
      supabase.from('budget_entries').select('*, budget_categories(name), family_members(id, name)').eq('family_id', fid),
      supabase.from('family_members').select('id, name').eq('family_id', fid),
    ])
    if (cats) setCategories(cats)
    if (ents) setEntries(ents)
    if (mems) setMembers(mems)
    setLoading(false)
  }, [familyMember?.family_id])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const fid = familyMember.family_id
    const ch1 = supabase.channel('budget_cats_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_categories', filter: `family_id=eq.${fid}` }, fetchAll)
      .subscribe()
    const ch2 = supabase.channel('budget_entries_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_entries', filter: `family_id=eq.${fid}` }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [familyMember?.family_id, fetchAll])

  async function handleAddCategory(name) {
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1)
    const { error } = await supabase.from('budget_categories').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
      sort_order: maxOrder + 1,
    })
    if (!error) await fetchAll()
    return error
  }

  async function handleDeleteCategory(id) {
    await supabase.from('budget_categories').delete().eq('id', id)
    await fetchAll()
  }

  async function handleSaveEntry(data, entryId) {
    if (entryId) {
      await supabase.from('budget_entries').update({
        category_id: data.categoryId,
        member_id: data.memberId || null,
        amount: Number(data.amount),
        note: data.note?.trim() || null,
      }).eq('id', entryId)
    } else {
      await supabase.from('budget_entries').insert({
        family_id: familyMember.family_id,
        category_id: data.categoryId,
        member_id: data.memberId || null,
        amount: Number(data.amount),
        note: data.note?.trim() || null,
      })
    }
    await fetchAll()
  }

  async function handleDeleteEntry(id) {
    await supabase.from('budget_entries').delete().eq('id', id)
    await fetchAll()
  }

  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る">
          <BsHouseFill />
        </button>
        <h1 className={styles.headerTitle}>📊 予算管理</h1>
        <button
          className={styles.addBtn}
          onClick={() => setShowAddEntry(true)}
          disabled={categories.length === 0}
          title={categories.length === 0 ? '先に費目を追加してください' : '予算を追加'}
        >
          ＋ 追加
        </button>
      </header>

      <div className={styles.viewTabs}>
        {[['category', 'カテゴリ別'], ['member', 'メンバー別'], ['total', '全体']].map(([v, label]) => (
          <button
            key={v}
            className={`${styles.viewTab} ${view === v ? styles.viewTabActive : ''}`}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>

      <main className={styles.main}>
        {loading ? (
          <p className={styles.hint}>読み込み中...</p>
        ) : view === 'category' ? (
          <CategoryView
            categories={categories}
            entries={entries}
            members={members}
            onAddCategory={() => setShowAddCategory(true)}
            onDeleteCategory={handleDeleteCategory}
            onAddEntry={categoryId => setShowAddEntry(categoryId)}
            onEditEntry={setEditEntry}
          />
        ) : view === 'member' ? (
          <MemberView
            members={members}
            entries={entries}
            categories={categories}
            onEditEntry={setEditEntry}
          />
        ) : (
          <TotalView
            categories={categories}
            entries={entries}
            members={members}
            totalAmount={totalAmount}
          />
        )}
      </main>

      {showAddCategory && (
        <AddCategoryModal
          onSubmit={async name => {
            const err = await handleAddCategory(name)
            if (!err) setShowAddCategory(false)
            return err
          }}
          onClose={() => setShowAddCategory(false)}
        />
      )}

      {showAddEntry !== null && (
        <EntryModal
          categories={categories}
          members={members}
          initialCategoryId={typeof showAddEntry === 'string' ? showAddEntry : null}
          onSubmit={async data => {
            await handleSaveEntry(data, null)
            setShowAddEntry(null)
          }}
          onClose={() => setShowAddEntry(null)}
        />
      )}

      {editEntry && (
        <EntryModal
          categories={categories}
          members={members}
          initialData={editEntry}
          onSubmit={async data => {
            await handleSaveEntry(data, editEntry.id)
            setEditEntry(null)
          }}
          onDelete={async () => {
            await handleDeleteEntry(editEntry.id)
            setEditEntry(null)
          }}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  )
}

// ── カテゴリ別ビュー ──────────────────────────────────────
function CategoryView({ categories, entries, members, onAddCategory, onDeleteCategory, onAddEntry, onEditEntry }) {
  const memberMap = Object.fromEntries(members.map(m => [m.id, m.name]))
  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0)

  if (categories.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📊</span>
        <p>費目がまだありません</p>
        <p className={styles.emptyDesc}>水道代・食費など月々の固定費を登録しましょう</p>
        <button className={styles.emptyBtn} onClick={onAddCategory}>費目を追加する</button>
      </div>
    )
  }

  return (
    <div className={styles.listWrapper}>
      {categories.map(cat => {
        const catEntries = entries.filter(e => e.category_id === cat.id)
        const catTotal = catEntries.reduce((s, e) => s + e.amount, 0)
        return (
          <div key={cat.id} className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <span className={styles.categoryName}>{cat.name}</span>
              <div className={styles.categoryRight}>
                <span className={styles.categoryTotal}>¥{catTotal.toLocaleString()}</span>
                <button
                  className={styles.categoryDeleteBtn}
                  onClick={() => onDeleteCategory(cat.id)}
                  aria-label={`${cat.name}を削除`}
                >×</button>
              </div>
            </div>
            {catEntries.length === 0 ? (
              <p className={styles.categoryEmpty}>エントリがありません</p>
            ) : (
              <ul className={styles.entryList}>
                {catEntries.map(entry => (
                  <li key={entry.id} className={styles.entryRow} onClick={() => onEditEntry(entry)}>
                    <span className={styles.entryMember}>
                      {entry.member_id ? (memberMap[entry.member_id] ?? '不明') : '共通'}
                    </span>
                    {entry.note && <span className={styles.entryNote}>{entry.note}</span>}
                    <span className={styles.entryAmount}>¥{entry.amount.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className={styles.addEntryBtn} onClick={() => onAddEntry(cat.id)}>
              ＋ エントリを追加
            </button>
          </div>
        )
      })}

      <div className={styles.totalBlock}>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>月額合計</span>
          <span className={styles.totalAmount}>¥{totalAmount.toLocaleString()}</span>
        </div>
        {entries.length > 0 && members.length > 0 && (
          <div className={styles.memberSubtotals}>
            {(() => {
              const sharedTotal = entries.filter(e => e.member_id === null).reduce((s, e) => s + e.amount, 0)
              const perPerson = Math.floor(sharedTotal / members.length)
              return members.map(m => {
                const personal = entries.filter(e => e.member_id === m.id).reduce((s, e) => s + e.amount, 0)
                return (
                  <div key={m.id} className={styles.memberSubtotalRow}>
                    <span className={styles.memberSubtotalName}>{m.name}</span>
                    <span className={styles.memberSubtotalAmount}>¥{(personal + perPerson).toLocaleString()}</span>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      <button className={styles.addCategoryBtn} onClick={onAddCategory}>
        ＋ 費目を追加
      </button>
    </div>
  )
}

// ── メンバー別ビュー ──────────────────────────────────────
function MemberView({ members, entries, categories, onEditEntry }) {
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]))

  const sharedEntries = entries.filter(e => e.member_id === null)
  const sharedTotal = sharedEntries.reduce((s, e) => s + e.amount, 0)
  const perPerson = members.length > 0 ? Math.floor(sharedTotal / members.length) : 0

  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0)

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>👥</span>
        <p>予算がまだ登録されていません</p>
      </div>
    )
  }

  return (
    <div className={styles.listWrapper}>
      {members.map(m => {
        const personalEntries = entries.filter(e => e.member_id === m.id)
        const personalTotal = personalEntries.reduce((s, e) => s + e.amount, 0)
        const memberTotal = personalTotal + perPerson
        return (
          <div key={m.id} className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <span className={styles.categoryName}>{m.name}</span>
              <span className={styles.categoryTotal}>¥{memberTotal.toLocaleString()}</span>
            </div>
            <ul className={styles.entryList}>
              {personalEntries.map(entry => (
                <li key={entry.id} className={styles.entryRow} onClick={() => onEditEntry(entry)}>
                  <span className={styles.entryMember}>{categoryMap[entry.category_id] ?? '不明'}</span>
                  {entry.note && <span className={styles.entryNote}>{entry.note}</span>}
                  <span className={styles.entryAmount}>¥{entry.amount.toLocaleString()}</span>
                </li>
              ))}
              {perPerson > 0 && (
                <li className={`${styles.entryRow} ${styles.entryRowShared}`}>
                  <span className={styles.entryMember}>共通按分</span>
                  <span className={styles.entryNote}>
                    {sharedEntries.length}件 ÷ {members.length}人
                  </span>
                  <span className={styles.entryAmount}>¥{perPerson.toLocaleString()}</span>
                </li>
              )}
            </ul>
          </div>
        )
      })}

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>月額合計</span>
        <span className={styles.totalAmount}>¥{totalAmount.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ── 全体ビュー ────────────────────────────────────────────
function TotalView({ categories, entries, members, totalAmount }) {
  const byCategory = categories
    .map(cat => ({
      name: cat.name,
      total: entries.filter(e => e.category_id === cat.id).reduce((s, e) => s + e.amount, 0),
    }))
    .filter(c => c.total > 0)

  const sharedTotal = entries.filter(e => e.member_id === null).reduce((s, e) => s + e.amount, 0)
  const perPerson = members.length > 0 ? Math.floor(sharedTotal / members.length) : 0

  const byMember = members.map(m => ({
    name: m.name,
    total: entries.filter(e => e.member_id === m.id).reduce((s, e) => s + e.amount, 0) + perPerson,
  })).filter(m => m.total > 0)

  if (totalAmount === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📊</span>
        <p>予算がまだ登録されていません</p>
      </div>
    )
  }

  return (
    <div className={styles.listWrapper}>
      <div className={styles.totalHero}>
        <p className={styles.totalHeroLabel}>月額合計</p>
        <p className={styles.totalHeroAmount}>¥{totalAmount.toLocaleString()}</p>
      </div>

      {byCategory.length > 0 && (
        <div className={styles.summaryCard}>
          <h3 className={styles.summaryTitle}>カテゴリ別</h3>
          {byCategory.map(c => (
            <div key={c.name} className={styles.summaryRow}>
              <span className={styles.summaryLabel}>{c.name}</span>
              <span className={styles.summaryAmount}>¥{c.total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {byMember.length > 0 && (
        <div className={styles.summaryCard}>
          <h3 className={styles.summaryTitle}>メンバー別</h3>
          {byMember.map(m => (
            <div key={m.name} className={styles.summaryRow}>
              <span className={styles.summaryLabel}>{m.name}</span>
              <span className={styles.summaryAmount}>¥{m.total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 費目追加モーダル ──────────────────────────────────────
function AddCategoryModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    const err = await onSubmit(name.trim())
    if (err) setError('追加に失敗しました')
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>費目を追加</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            費目名
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: 水道代、食費、通信費..."
              maxLength={50}
              autoFocus
              required
            />
          </label>
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.formBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '追加中...' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 予算エントリ追加/編集モーダル ─────────────────────────
function EntryModal({ categories, members, initialCategoryId, initialData, onSubmit, onDelete, onClose }) {
  const isEdit = !!initialData
  const [categoryId, setCategoryId] = useState(
    initialData?.category_id ?? initialCategoryId ?? categories[0]?.id ?? ''
  )
  const [memberId, setMemberId] = useState(initialData?.member_id ?? '')
  const [amount, setAmount] = useState(initialData?.amount?.toString() ?? '')
  const [note, setNote] = useState(initialData?.note ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!categoryId || !amount) return
    setSubmitting(true)
    await onSubmit({ categoryId, memberId: memberId || null, amount, note })
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? '予算を編集' : '予算を追加'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            費目
            <select
              className={styles.input}
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              required
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={styles.label}>
            負担者
            <select
              className={styles.input}
              value={memberId}
              onChange={e => setMemberId(e.target.value)}
            >
              <option value="">共通（家族全体）</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className={styles.label}>
            金額（円）
            <input
              className={styles.input}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="例: 5000"
              min={0}
              max={9999999}
              required
            />
          </label>
          <label className={styles.label}>
            メモ（任意）
            <input
              className={styles.input}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="例: 毎月27日引き落とし"
              maxLength={100}
            />
          </label>
          <div className={styles.formBtns}>
            {isEdit && onDelete && (
              <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>
            )}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !categoryId || !amount}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
