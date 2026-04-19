import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
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

export default function InventoryPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingQtyId, setEditingQtyId] = useState(null)
  const [tempQty, setTempQty] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

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

  async function updateQuantity(item, delta) {
    const next = Math.max(0, Number(item.quantity) + delta)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: next } : i))
    await supabase
      .from('inventory_items')
      .update({ quantity: next, updated_by: familyMember.name, updated_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  async function commitQtyEdit(item) {
    const next = Math.max(0, Number(tempQty))
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: next } : i))
    setEditingQtyId(null)
    await supabase
      .from('inventory_items')
      .update({ quantity: next, updated_by: familyMember.name, updated_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  async function deleteItem(id) {
    setDeleteConfirmId(null)
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('inventory_items').delete().eq('id', id)
  }

  const filtered = items.filter(item => {
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

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
        <button className={styles.backBtn} onClick={() => navigate('/')}>←</button>
        <span className={styles.title}>在庫管理</span>
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
          <div className={styles.empty}>読み込み中…</div>
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
                      editingQtyId={editingQtyId}
                      tempQty={tempQty}
                      onMinus={() => updateQuantity(item, -1)}
                      onPlus={() => updateQuantity(item, 1)}
                      onQtyTap={() => { setEditingQtyId(item.id); setTempQty(String(item.quantity)) }}
                      onQtyChange={v => setTempQty(v)}
                      onQtyCommit={() => commitQtyEdit(item)}
                      onQtyBlur={() => commitQtyEdit(item)}
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

      {showModal && (
        <ItemModal
          item={editingItem}
          familyMember={familyMember}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchItems() }}
        />
      )}

      {deleteConfirmId && (
        <div className={styles.overlay} onClick={() => setDeleteConfirmId(null)}>
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>この品目を削除しますか？</p>
            <div className={styles.confirmBtns}>
              <button className={styles.cancelBtn} onClick={() => setDeleteConfirmId(null)}>キャンセル</button>
              <button className={styles.deleteBtn} onClick={() => deleteItem(deleteConfirmId)}>削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InventoryCard({ item, editingQtyId, tempQty, onMinus, onPlus, onQtyTap, onQtyChange, onQtyCommit, onQtyBlur, onEdit, onDelete }) {
  const cat = getCategoryInfo(item.category)
  const isEditing = editingQtyId === item.id

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardInfo}>
          <span className={styles.badge} style={{ background: cat.color + '22', color: cat.color }}>
            {cat.label}
          </span>
          <span className={styles.itemName}>{item.name}</span>
          {item.note && <span className={styles.itemNote}>{item.note}</span>}
        </div>
        <div className={styles.cardMenu}>
          <button className={styles.menuBtn} onClick={onEdit} aria-label="編集">✏️</button>
          <button className={`${styles.menuBtn} ${styles.menuBtnDel}`} onClick={onDelete} aria-label="削除">✕</button>
        </div>
      </div>

      <div className={styles.cardBottom}>
        <button className={`${styles.qtyBtn} ${styles.qtyBtnMinus}`} onClick={onMinus} aria-label="減らす">－</button>
        <div className={styles.qtyCenter}>
          {isEditing ? (
            <input
              type="number"
              className={styles.qtyInput}
              value={tempQty}
              onChange={e => onQtyChange(e.target.value)}
              onBlur={onQtyBlur}
              onKeyDown={e => { if (e.key === 'Enter') onQtyCommit(); if (e.key === 'Escape') onQtyBlur() }}
              autoFocus
            />
          ) : (
            <button className={styles.qtyValue} onClick={onQtyTap} title="タップして数量を入力">
              {Number(item.quantity) % 1 === 0 ? Number(item.quantity) : item.quantity}
            </button>
          )}
          <span className={styles.unit}>{item.unit}</span>
        </div>
        <button className={`${styles.qtyBtn} ${styles.qtyBtnPlus}`} onClick={onPlus} aria-label="増やす">＋</button>
      </div>
    </div>
  )
}

function ItemModal({ item, familyMember, onClose, onSaved }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? 0)
  const [unit, setUnit] = useState(item?.unit ?? '個')
  const [category, setCategory] = useState(item?.category ?? 'other')
  const [note, setNote] = useState(item?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('品名を入力してください'); return }
    setSaving(true)
    const payload = {
      family_id: familyMember.family_id,
      name: name.trim(),
      quantity: Math.max(0, Number(quantity)),
      unit,
      category,
      note: note.trim() || null,
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

          <label className={styles.label}>数量・単位</label>
          <div className={styles.qtyUnitRow}>
            <input
              className={`${styles.input} ${styles.qtyNumInput}`}
              type="number"
              min="0"
              step="0.1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
            <select className={styles.select} value={unit} onChange={e => setUnit(e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <label className={styles.label}>カテゴリ</label>
          <select className={styles.select} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.filter(c => c.value !== 'all').map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

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
