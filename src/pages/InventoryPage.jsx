import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import ConfirmDialog from '../components/ConfirmDialog'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import styles from './InventoryPage.module.css'

const CATEGORIES = [
  { value: 'all',            label: 'すべて',       color: '#8E81B5' },
  { value: 'vegetable',      label: '野菜',         color: '#5A9E82' },
  { value: 'meat_fish',      label: '肉・魚',       color: '#C45A5A' },
  { value: 'dairy',          label: '乳製品',       color: '#C49A5A' },
  { value: 'seasoning',      label: '調味料',       color: '#8E81B5' },
  { value: 'frozen',         label: '冷凍食品',     color: '#5A7A9E' },
  { value: 'drink',          label: '飲み物',       color: '#5A9E9E' },
  { value: 'snack',          label: 'お菓子',       color: '#C2826A' },
  { value: 'daily_hygiene',  label: '衛生用品',     color: '#9E5A8E' },
  { value: 'daily_laundry',  label: '洗濯・掃除',   color: '#6A8EC2' },
  { value: 'daily_kitchen',  label: 'キッチン用品', color: '#7A9E5A' },
  { value: 'daily_other',    label: '日用品その他', color: '#9E7A5A' },
  { value: 'other',          label: 'その他',       color: '#999' },
]

const UNITS = ['個', 'g', 'kg', 'ml', 'L', '本', '袋', '缶', '箱', '枚', '束', 'パック', '合']

function getCategoryInfo(value) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1]
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function getExpiryInfo(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(dateStr + 'T00:00:00')
  const days = Math.round((expiry - today) / 86400000)

  if (days < 0) {
    return { label: `期限切れ (${formatDate(dateStr)})`, color: '#C45A5A', days, urgent: true }
  }
  if (days <= 3) {
    return { label: `${formatDate(dateStr)}まで（あと${days}日）`, color: '#C2826A', days, urgent: true }
  }
  if (days <= 7) {
    return { label: `${formatDate(dateStr)}まで（あと${days}日）`, color: '#C49A5A', days, urgent: false }
  }
  return { label: `${formatDate(dateStr)}まで（あと${days}日）`, color: '#aaa', days, urgent: false }
}

export default function InventoryPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [showAddToShoppingModal, setShowAddToShoppingModal] = useState(false)
  const [addingToShopping, setAddingToShopping] = useState(false)
  const [shoppingLists, setShoppingLists] = useState([])
  const [selectedForShopping, setSelectedForShopping] = useState(new Set())
  const [targetListId, setTargetListId] = useState(null)
  const [shoppingError, setShoppingError] = useState('')

  const fid = familyMember?.family_id

  const fetchItems = useCallback(async () => {
    if (!fid) return
    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('family_id', fid)
      .order('category')
      .order('name')
    setItems(data ?? [])
    setLoading(false)
  }, [fid])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (!fid) return
    const channel = supabase
      .channel('inventory_rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory_items',
        filter: `family_id=eq.${fid}`,
      }, fetchItems)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fid, fetchItems])

  const cycleStatus = (current) => {
    const cycle = { ok: 'low', low: 'out', out: 'ok' }
    return cycle[current] ?? 'ok'
  }

  async function updateStatus(item, nextStatus) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock_status: nextStatus } : i))
    await supabase
      .from('inventory_items')
      .update({ stock_status: nextStatus, updated_by: familyMember.name, updated_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  async function handleStatusCycle(item) {
    const nextStatus = cycleStatus(item.stock_status ?? 'ok')
    await updateStatus(item, nextStatus)
  }

  async function deleteItem(id) {
    setDeleteConfirmId(null)
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('inventory_items').delete().eq('id', id)
  }

  const filtered = items.filter(item => {
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter
    const matchStatus = statusFilter === 'all' || item.stock_status === statusFilter
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchStatus && matchSearch
  })

  const summary = {
    out: items.filter(i => i.stock_status === 'out').length,
    low: items.filter(i => i.stock_status === 'low').length,
    ok: items.filter(i => i.stock_status === 'ok').length,
  }

  const needsBuyingItems = items.filter(i => {
    const byStatus = i.stock_status === 'out' || i.stock_status === 'low'
    const expInfo = getExpiryInfo(i.expiry_date)
    const byExpiry = expInfo !== null && expInfo.days <= 7
    return byStatus || byExpiry
  })
  const needsBuyingCount = needsBuyingItems.length

  const grouped = filtered.reduce((acc, item) => {
    const key = item.category
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const groupOrder = CATEGORIES.slice(1).map(c => c.value)
  const sortedGroups = Object.keys(grouped).sort(
    (a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b)
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
        <span className={styles.title}>📦 在庫管理</span>
        <button className={styles.addBtn} onClick={() => { setEditingItem(null); setShowModal(true) }}>＋ 追加</button>
      </header>

      <div className={styles.searchBar}>
        <input
          type="search"
          placeholder="品名で検索…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.summaryBar}>
        {[
          { key: 'out', label: '切れ', color: '#C45A5A' },
          { key: 'low', label: '少ない', color: '#C49A5A' },
          { key: 'ok', label: '十分', color: '#5A9E82' },
        ].map(s => (
          <button
            key={s.key}
            className={`${styles.summaryChip} ${statusFilter === s.key ? styles.summaryChipActive : ''}`}
            style={statusFilter === s.key ? { borderColor: s.color, color: s.color } : {}}
            onClick={() => setStatusFilter(prev => prev === s.key ? 'all' : s.key)}
          >
            <span style={{ color: s.color }}>●</span> {s.label} {summary[s.key]}件
          </button>
        ))}
      </div>

      <div className={styles.catTabs}>
        <div className={styles.catTabsInner}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`${styles.catTab} ${categoryFilter === cat.value ? styles.catTabActive : ''}`}
              style={categoryFilter === cat.value ? { borderColor: cat.color, color: cat.color } : {}}
              onClick={() => setCategoryFilter(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <main className={styles.main}>
        {loading ? (
          <LoadingSpinner inline />
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📦</span>
            <p>在庫がありません</p>
            <button className={styles.emptyAddBtn} onClick={() => { setEditingItem(null); setShowModal(true) }}>
              最初の品目を追加する
            </button>
          </div>
        ) : (
          <div className={styles.listWrap}>
            {sortedGroups.map(catValue => {
              const cat = getCategoryInfo(catValue)
              return (
                <div key={catValue} className={styles.group}>
                  {categoryFilter === 'all' && (
                    <div className={styles.groupHeader} style={{ color: cat.color }}>
                      {cat.label}
                    </div>
                  )}
                  {grouped[catValue].map(item => (
                    <InventoryCard
                      key={item.id}
                      item={item}
                      onStatusCycle={() => handleStatusCycle(item)}
                      onEdit={() => { setEditingItem(item); setShowModal(true) }}
                      onDelete={() => setDeleteConfirmId(item.id)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {needsBuyingCount > 0 && (
        <div className={styles.floatingBar}>
          <button
            className={styles.addToShoppingBtn}
            onClick={() => {
              setShowAddToShoppingModal(true)
              setSelectedForShopping(new Set(needsBuyingItems.map(i => i.id)))
              fetchShoppingLists()
            }}
          >
            🛒 切れ・少ないを買い物リストに追加（{needsBuyingCount}件）
          </button>
        </div>
      )}

      {showModal && (
        <ItemModal
          item={editingItem}
          familyMember={familyMember}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchItems() }}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="品目を削除しますか？"
        message="この品目を削除します。この操作は取り消せません。"
        confirmLabel="削除する"
        onConfirm={() => { const id = deleteConfirmId; setDeleteConfirmId(null); deleteItem(id) }}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <BottomNav />

      {showAddToShoppingModal && (
        <AddToShoppingModal
          items={needsBuyingItems}
          selectedIds={selectedForShopping}
          onToggle={id => {
            const next = new Set(selectedForShopping)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            setSelectedForShopping(next)
          }}
          shoppingLists={shoppingLists}
          targetListId={targetListId}
          onListChange={setTargetListId}
          onAddToShopping={handleAddToShopping}
          onClose={() => setShowAddToShoppingModal(false)}
          loading={addingToShopping}
          error={shoppingError}
        />
      )}
    </div>
  )

  async function fetchShoppingLists() {
    if (!fid) return
    const { data } = await supabase
      .from('shopping_lists')
      .select('id, name')
      .eq('family_id', fid)
      .order('name')
    setShoppingLists(data ?? [])
    if (data && data.length > 0 && !targetListId) {
      setTargetListId(data[0].id)
    }
  }

  async function handleAddToShopping() {
    if (!targetListId || selectedForShopping.size === 0) return
    setAddingToShopping(true)
    setShoppingError('')

    const selectedItems = needsBuyingItems.filter(i => selectedForShopping.has(i.id))
    const insertRows = selectedItems.map(item => ({
      list_id: targetListId,
      name: item.name,
      memo: item.note || null,
      added_by: familyMember.name,
      checked: false,
    }))

    const { error } = await supabase
      .from('shopping_items')
      .insert(insertRows)

    if (error) {
      setShoppingError('買い物リストへの追加に失敗しました')
    } else {
      setShowAddToShoppingModal(false)
      setSelectedForShopping(new Set())
      setTargetListId(null)
    }
    setAddingToShopping(false)
  }
}

const STATUS_CONFIG = {
  ok: { label: '十分', color: '#5A9E82' },
  low: { label: '少ない', color: '#C49A5A' },
  out: { label: '切れ', color: '#C45A5A' },
}

function InventoryCard({ item, onStatusCycle, onEdit, onDelete }) {
  const cat = getCategoryInfo(item.category)
  const status = item.stock_status ?? 'ok'
  const statusConf = STATUS_CONFIG[status]
  const expiryInfo = getExpiryInfo(item.expiry_date)

  return (
    <div className={styles.card}>
      <div className={styles.cardLeft}>
        <span className={styles.badge} style={{ background: cat.color + '22', color: cat.color }}>
          {cat.label}
        </span>
        <span className={styles.itemName}>{item.name}</span>
        {expiryInfo && <span className={styles.expiryTag} style={{ color: expiryInfo.color }}>📅 {expiryInfo.label}</span>}
        {item.note && <span className={styles.itemNote}>{item.note}</span>}
      </div>
      <div className={styles.cardRight}>
        <button
          className={styles.statusBtn}
          style={{ background: statusConf.color + '22', color: statusConf.color }}
          onClick={onStatusCycle}
          aria-label="ストック状態を変更"
        >
          <span>●</span> {statusConf.label}
        </button>
        <div className={styles.cardActions}>
          <button className={styles.editBtn} onClick={onEdit}>編集</button>
          <button className={styles.delBtn} onClick={onDelete}>削除</button>
        </div>
      </div>
    </div>
  )
}

function ItemModal({ item, familyMember, onClose, onSaved }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [stockStatus, setStockStatus] = useState(item?.stock_status ?? 'ok')
  const [category, setCategory] = useState(item?.category ?? 'other')
  const [note, setNote] = useState(item?.note ?? '')
  const [expiryDate, setExpiryDate] = useState(item?.expiry_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('品名を入力してください'); return }
    setSaving(true)
    const payload = {
      family_id: familyMember.family_id,
      name: name.trim(),
      category,
      stock_status: stockStatus,
      note: note.trim() || null,
      expiry_date: expiryDate || null,
      updated_by: familyMember.name,
      updated_at: new Date().toISOString(),
    }
    if (isEdit) {
      const { error: err } = await supabase
        .from('inventory_items')
        .update(payload)
        .eq('id', item.id)
      if (err) { setError('保存に失敗しました'); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('inventory_items')
        .insert(payload)
      if (err) { setError('保存に失敗しました'); setSaving(false); return }
    }
    onSaved()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{isEdit ? '品目を編集' : '品目を追加'}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.formBody}>
          <label className={styles.label}>品名 *</label>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：牛乳、シャンプー"
            autoFocus
          />

          <label className={styles.label}>カテゴリ</label>
          <select className={styles.select} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.filter(c => c.value !== 'all').map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <label className={styles.label}>初期ストック状態</label>
          <div className={styles.statusSelectRow}>
            {['ok', 'low', 'out'].map(s => (
              <button
                key={s}
                className={`${styles.statusSelectBtn} ${stockStatus === s ? styles.statusSelectActive : ''}`}
                style={stockStatus === s ? { borderColor: STATUS_CONFIG[s].color, color: STATUS_CONFIG[s].color } : {}}
                onClick={() => setStockStatus(s)}
              >
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          <label className={styles.label}>賞味期限（任意）</label>
          <div className={styles.quickDateRow}>
            {[
              { label: '今日', days: 0 },
              { label: '+3日', days: 3 },
              { label: '+1週間', days: 7 },
              { label: '+2週間', days: 14 },
              { label: '+1ヶ月', days: 30 },
              { label: '+3ヶ月', days: 90 },
              { label: '+半年', days: 180 },
              { label: '+1年', days: 365 },
            ].map(({ label, days }) => (
              <button
                key={label}
                type="button"
                className={styles.quickDateBtn}
                onClick={() => setExpiryDate(addDays(days))}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.quickDateBtn} ${styles.quickDateBtnClear}`}
              onClick={() => setExpiryDate('')}
            >
              なし
            </button>
          </div>
          <input
            className={styles.input}
            type="date"
            value={expiryDate}
            onChange={e => setExpiryDate(e.target.value)}
          />

          <label className={styles.label}>メモ（任意）</label>
          <input
            className={styles.input}
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="例：〇〇スーパーで購入"
          />

          {error && <p className={styles.formError}>{error}</p>}

          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddToShoppingModal({ items, selectedIds, onToggle, shoppingLists, targetListId, onListChange, onAddToShopping, onClose, loading, error }) {
  const selectedCount = selectedIds.size
  const outItems = items.filter(i => i.stock_status === 'out')
  const lowItems = items.filter(i => i.stock_status === 'low')
  const expiryItems = items.filter(i => {
    const expInfo = getExpiryInfo(i.expiry_date)
    return expInfo && expInfo.days <= 7 && i.stock_status !== 'out' && i.stock_status !== 'low'
  })

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.shoppingModal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>買い物リストに追加</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.formBody}>
          <label className={styles.label}>追加先リスト</label>
          <select className={styles.select} value={targetListId || ''} onChange={e => onListChange(e.target.value)}>
            <option value="">リストを選択してください</option>
            {shoppingLists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>

          {outItems.length > 0 && (
            <div className={styles.itemCheckSection}>
              <div className={styles.sectionTitle}>🔴 切れ ({outItems.length}件)</div>
              <div className={styles.itemCheckList}>
                {outItems.map(item => (
                  <label key={item.id} className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggle(item.id)}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {lowItems.length > 0 && (
            <div className={styles.itemCheckSection}>
              <div className={styles.sectionTitle}>🟡 少ない ({lowItems.length}件)</div>
              <div className={styles.itemCheckList}>
                {lowItems.map(item => (
                  <label key={item.id} className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggle(item.id)}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {expiryItems.length > 0 && (
            <div className={styles.itemCheckSection}>
              <div className={styles.sectionTitle}>⚠️ 期限切れ・期限間近 ({expiryItems.length}件)</div>
              <div className={styles.itemCheckList}>
                {expiryItems.map(item => {
                  const expInfo = getExpiryInfo(item.expiry_date)
                  return (
                    <label key={item.id} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => onToggle(item.id)}
                      />
                      <span>{item.name} <span style={{ fontSize: '0.75rem', color: expInfo.color }}>📅 {expInfo.label}</span></span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalBtns}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>キャンセル</button>
            <button
              className={styles.saveBtn}
              onClick={onAddToShopping}
              disabled={loading || selectedCount === 0 || !targetListId}
            >
              {loading ? '追加中…' : `${selectedCount}件を追加`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
