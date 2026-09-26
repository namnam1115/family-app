import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import {
  IconPrice, IconChart, IconList, IconShop, IconSearch,
  IconGrocery, IconDaily, IconBox, IconCheckBold, IconClose,
} from '../lib/icons'
import { supabase } from '../lib/supabase'
import { buildComparison, formatPrice, normalizeSearchText, unitPriceOf } from '../lib/price'
import { useFamilyData, unwrap } from '../hooks/useFamilyData'
import { useAuth } from '../contexts/AuthContext'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorNotice from '../components/ErrorNotice'
import ConfirmDialog from '../components/ConfirmDialog'
import { Icon } from '../components/price/PriceIcon'
import CompareSheet from '../components/price/CompareSheet'
import PriceEntryModal from '../components/price/PriceEntryModal'
import StoreModal from '../components/price/StoreModal'
import styles from './PricePage.module.css'

const SORT_OPTIONS = [
  { value: 'name',   label: '名前順' },
  { value: 'saving', label: '価格差が大きい順' },
  { value: 'recent', label: '更新が新しい順' },
]

export default function PricePage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState('list') // 'list' | 'grid'
  const [selectedProduct, setSelectedProduct] = useState(null)
  // null: 閉じている / 文字列: その商品名を初期値に価格追加モーダルを開く
  const [entryProduct, setEntryProduct] = useState(null)
  const [showStoreModal, setShowStoreModal] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [storeFilter, setStoreFilter] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: { stores, items },
    loading,
    error: loadError,
    refetch: fetchAll,
    setData,
  } = useFamilyData(
    async familyId => {
      const [stores, items] = await Promise.all([
        unwrap(supabase.from('price_stores').select('*').eq('family_id', familyId).order('sort_order').order('name')),
        unwrap(supabase.from('price_items').select('*').eq('family_id', familyId).order('product_name').order('store_name')),
      ])
      return { stores, items }
    },
    ['price_stores', 'price_items'],
    { stores: [], items: [] },
  )

  // ── Data processing ──
  const storeNames = stores.map(s => s.name)

  // rowsByProduct[商品名][店舗名] = price_items の行
  const rowsByProduct = {}
  const productCategory = {}
  const productIcon = {}
  const productSearchText = {}
  for (const item of items) {
    const name = item.product_name
    if (!rowsByProduct[name]) {
      rowsByProduct[name] = {}
      productSearchText[name] = normalizeSearchText(name)
    }
    rowsByProduct[name][item.store_name] = item
    if (!productCategory[name]) productCategory[name] = item.category ?? 'food'
    if (!productIcon[name] && item.icon) productIcon[name] = item.icon
    // メモ（「特売」「PB」など）でも引けるようにする
    if (item.note) productSearchText[name] += ` ${normalizeSearchText(item.note)}`
  }
  const allProducts = Object.keys(rowsByProduct).sort((a, b) => a.localeCompare(b, 'ja'))

  const comparisons = {}
  for (const product of allProducts) {
    const rows = storeNames.map(s => rowsByProduct[product][s]).filter(Boolean)
    comparisons[product] = buildComparison(rows)
  }

  const query = normalizeSearchText(searchQuery)
  const products = allProducts.filter(p => {
    if (categoryFilter !== 'all' && productCategory[p] !== categoryFilter) return false
    if (storeFilter && !rowsByProduct[p][storeFilter]) return false
    if (query && !productSearchText[p].includes(query)) return false
    return true
  })
  if (sortKey === 'saving') {
    products.sort((a, b) => (comparisons[b]?.spreadRate ?? -1) - (comparisons[a]?.spreadRate ?? -1))
  } else if (sortKey === 'recent') {
    products.sort((a, b) => (comparisons[b]?.latest ?? '').localeCompare(comparisons[a]?.latest ?? ''))
  }

  async function handleUpsert({ storeName, productName, price, note, category, icon, quantity, unit }) {
    const payload = {
      family_id: familyMember.family_id,
      store_name: storeName,
      product_name: productName,
      price: Number(price),
      note: note?.trim() || null,
      // 価格だけの編集でも、既存商品のカテゴリを「食材」に戻さない
      category: category ?? productCategory[productName] ?? 'food',
      updated_by: familyMember.name,
      updated_at: new Date().toISOString(),
    }
    if (icon !== undefined) payload.icon = icon
    // 内容量を扱わない入力（一覧表のセル）では既存の内容量を残す。
    // 空欄のまま（消す対象もない）なら列自体を送らず、マイグレーション 036 適用前でも保存できるようにする
    const qty = quantity !== undefined && quantity !== '' ? Number(quantity) : null
    if (qty > 0 || (quantity !== undefined && rowsByProduct[productName]?.[storeName]?.quantity != null)) {
      payload.quantity = qty > 0 ? qty : null
      payload.unit = qty > 0 ? unit : null
    }

    const { error } = await supabase.from('price_items').upsert(
      payload,
      { onConflict: 'family_id,store_name,product_name' }
    )
    if (error) {
      console.error('価格保存エラー:', error)
      return error
    }
    // 同一商品の全行にカテゴリ・アイコンを反映
    const shared = {}
    if (category) shared.category = category
    if (icon) shared.icon = icon
    if (Object.keys(shared).length > 0) {
      const { error: sharedError } = await supabase.from('price_items')
        .update(shared)
        .eq('family_id', familyMember.family_id)
        .eq('product_name', productName)
      if (sharedError) console.error('カテゴリ・アイコン反映エラー:', sharedError)
    }
    await fetchAll()
    return null
  }

  async function handleIconUpdate(productName, icon) {
    await supabase.from('price_items')
      .update({ icon })
      .eq('family_id', familyMember.family_id)
      .eq('product_name', productName)
    await fetchAll()
  }

  async function handleDeleteItem(id) {
    setData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }))
    await supabase.from('price_items').delete().eq('id', id)
  }

  async function handleAddStore(name) {
    const { error } = await supabase.from('price_stores').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
    })
    if (!error) await fetchAll()
    return error
  }

  async function handleDeleteProduct(productName) {
    setData(prev => ({ ...prev, items: prev.items.filter(i => i.product_name !== productName) }))
    await supabase
      .from('price_items')
      .delete()
      .eq('product_name', productName)
      .eq('family_id', familyMember.family_id)
  }

  async function handleDeleteStore(id, name) {
    if (storeFilter === name) setStoreFilter('')
    setData(prev => ({
      stores: prev.stores.filter(s => s.id !== id),
      items: prev.items.filter(i => i.store_name !== name),
    }))
    await supabase.from('price_items')
      .delete().eq('store_name', name).eq('family_id', familyMember.family_id)
    await supabase.from('price_stores').delete().eq('id', id)
  }

  const isEmpty = !loading && stores.length > 0 && allProducts.length === 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
          <span className={styles.headerTitle}><IconPrice className={styles.headerTitleIcon} /> 価格比較</span>
        </div>
        <div className={styles.headerActions}>
          {products.length > 0 && (
            <button
              className={`${styles.viewToggleBtn} ${view === 'grid' ? styles.viewToggleActive : ''}`}
              onClick={() => setView(v => v === 'list' ? 'grid' : 'list')}
              title={view === 'list' ? '一覧表で見る' : 'リストで見る'}
            >
              {view === 'list' ? <><IconChart /> 一覧</> : <><IconList /> リスト</>}
            </button>
          )}
          <button className={styles.storeBtn} onClick={() => setShowStoreModal(true)} title="店舗管理">
            <IconShop /> <span className={styles.storeBtnLabel}>店舗</span>
          </button>
          <button
            className={styles.addBtn}
            onClick={() => setEntryProduct('')}
            disabled={stores.length === 0}
          >
            ＋ 追加
          </button>
        </div>
      </header>

      {/* 検索＋カテゴリ・店舗フィルター＋並び替え */}
      {!loading && allProducts.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}><IconSearch /></span>
            <input
              className={styles.searchInput}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="商品名・メモで検索..."
              aria-label="商品名・メモで検索"
            />
            {searchQuery && (
              <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="クリア">×</button>
            )}
          </div>
          <div className={styles.categoryChips}>
            {[
              { v: 'all', label: 'すべて', Icon: null },
              { v: 'food', label: '食材', Icon: IconGrocery },
              { v: 'daily', label: '日用品', Icon: IconDaily },
              { v: 'other', label: 'その他', Icon: IconBox },
            ].map(({ v, label, Icon }) => (
              <button
                key={v}
                className={`${styles.chip} ${categoryFilter === v ? styles.chipActive : ''}`}
                onClick={() => setCategoryFilter(v)}
              >{Icon && <Icon />} {label}</button>
            ))}
          </div>
          <div className={styles.filterSelects}>
            <select
              className={`${styles.filterSelect} ${storeFilter ? styles.filterSelectActive : ''}`}
              value={storeFilter}
              onChange={e => setStoreFilter(e.target.value)}
              aria-label="店舗で絞り込み"
            >
              <option value="">すべての店舗</option>
              {storeNames.map(s => <option key={s} value={s}>{s}で見る</option>)}
            </select>
            <select
              className={styles.filterSelect}
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              aria-label="並び替え"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )}

      <main className={styles.main}>
        {loading ? (
          <LoadingSpinner inline />
        ) : loadError ? (
          <ErrorNotice onRetry={fetchAll} />
        ) : stores.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><IconShop /></span>
            <p>まず店舗を登録してください</p>
            <button className={styles.emptyBtn} onClick={() => setShowStoreModal(true)}>
              店舗を追加する
            </button>
          </div>
        ) : isEmpty ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><IconPrice /></span>
            <p>価格データがありません</p>
            <p className={styles.emptyDesc}>「＋ 追加」から商品と価格を登録しましょう</p>
            <button className={styles.emptyBtn} onClick={() => setEntryProduct('')}>
              価格を追加する
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><IconSearch /></span>
            <p>{searchQuery ? `「${searchQuery}」は見つかりません` : '条件に合う商品はありません'}</p>
            {searchQuery.trim() && (
              <button className={styles.emptyBtn} onClick={() => setEntryProduct(searchQuery.trim())}>
                「{searchQuery.trim()}」の価格を登録
              </button>
            )}
          </div>
        ) : view === 'list' ? (
          <ProductListView
            products={products}
            comparisons={comparisons}
            rowsByProduct={rowsByProduct}
            productIcon={productIcon}
            storeFilter={storeFilter}
            onSelect={setSelectedProduct}
          />
        ) : (
          <GridView
            products={products}
            storeNames={storeNames}
            rowsByProduct={rowsByProduct}
            comparisons={comparisons}
            productIcon={productIcon}
            onUpsert={handleUpsert}
            onDeleteItem={handleDeleteItem}
            onDeleteProduct={handleDeleteProduct}
          />
        )}
      </main>

      {selectedProduct && rowsByProduct[selectedProduct] && (
        <CompareSheet
          product={selectedProduct}
          storeNames={storeNames}
          rowByStore={rowsByProduct[selectedProduct]}
          comparison={comparisons[selectedProduct]}
          icon={productIcon[selectedProduct] || null}
          familyMember={familyMember}
          onUpsert={handleUpsert}
          onDeleteItem={handleDeleteItem}
          onDeleteProduct={name => { handleDeleteProduct(name); setSelectedProduct(null) }}
          onIconUpdate={handleIconUpdate}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {entryProduct !== null && (
        <PriceEntryModal
          stores={storeNames}
          productNames={allProducts}
          rowsByProduct={rowsByProduct}
          productCategory={productCategory}
          productIcon={productIcon}
          initialProduct={entryProduct}
          onSubmit={async (data, { keepOpen }) => {
            const err = await handleUpsert(data)
            if (!err && !keepOpen) setEntryProduct(null)
            return err
          }}
          onClose={() => setEntryProduct(null)}
        />
      )}

      {showStoreModal && (
        <StoreModal
          stores={stores}
          onAdd={handleAddStore}
          onDelete={handleDeleteStore}
          onClose={() => setShowStoreModal(false)}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ── リストビュー ──────────────────────────────────────────
function ProductListView({ products, comparisons, rowsByProduct, productIcon, storeFilter, onSelect }) {
  return (
    <ul className={styles.productList}>
      {products.map(product => {
        const comparison = comparisons[product]
        const best = comparison?.best
        const icon = productIcon[product]
        const spread = comparison && comparison.count > 1 ? Math.round(comparison.spreadRate * 100) : 0
        // 店舗で絞り込み中は、その店の価格が最安と比べてどうかを見せる（店頭での判断用）
        const storeRow = storeFilter ? rowsByProduct[product][storeFilter] : null
        const storeIsBest = storeRow && comparison?.isBest(storeRow)
        const storeRate = storeRow && !storeIsBest && comparison.bestScore > 0
          ? Math.round((comparison.scoreOf(storeRow) / comparison.bestScore - 1) * 100)
          : 0
        return (
          <li key={product} className={styles.productListItem} onClick={() => onSelect(product)}>
            <span className={styles.productListIcon}>
              <Icon name={icon || 'TbShoppingCart'} size={22} />
            </span>
            <div className={styles.productListMain}>
              <span className={styles.productListName}>{product}</span>
              {comparison && (
                <span className={styles.productListSub}>
                  {comparison.count > 1 ? `${comparison.count}店で比較` : '1店のみ登録'}
                  {spread > 0 && <span className={styles.spreadTag}>最大{spread}%差</span>}
                </span>
              )}
            </div>
            <div className={styles.productListRight}>
              {storeRow ? (
                <div className={styles.bestInfo}>
                  <span className={storeIsBest ? styles.bestPrice : styles.otherPrice}>¥{formatPrice(storeRow.price)}</span>
                  {storeIsBest ? (
                    <span className={styles.bestTag}>最安</span>
                  ) : (
                    <>
                      {storeRate > 0 && <span className={styles.storeDiff}>最安より+{storeRate}%</span>}
                      <span className={`${styles.bestStore} ${styles.bestStoreWide}`}>最安: {best.store_name}</span>
                    </>
                  )}
                </div>
              ) : best ? (
                <div className={styles.bestInfo}>
                  <span className={styles.bestPrice}>¥{formatPrice(best.price)}</span>
                  <span className={styles.bestStore}>{best.store_name}</span>
                </div>
              ) : (
                <span className={styles.noPrice}>未登録</span>
              )}
              <span className={styles.chevron}>›</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── 一覧グリッドビュー ────────────────────────────────────
function GridView({ products, storeNames, rowsByProduct, comparisons, productIcon, onUpsert, onDeleteItem, onDeleteProduct }) {
  const [deleteTarget, setDeleteTarget] = useState(null)

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.matrix}>
        <thead>
          <tr>
            <th className={styles.productHeader}>商品</th>
            {storeNames.map(store => (
              <th key={store} className={styles.storeHeader}>{store}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map(product => {
            const comparison = comparisons[product]
            const icon = productIcon[product]
            return (
              <tr key={product}>
                <td className={styles.productCell}>
                  <div className={styles.productCellInner}>
                    {icon && <span className={styles.productGridIcon}><Icon name={icon} size={14} /></span>}
                    <span className={styles.productName}>{product}</span>
                    <button
                      className={styles.deleteProductBtn}
                      onClick={() => setDeleteTarget(product)}
                      aria-label={`${product}を削除`}
                    >×</button>
                  </div>
                </td>
                {storeNames.map(store => {
                  const item = rowsByProduct[product][store]
                  return (
                    <PriceCell
                      key={store}
                      item={item}
                      product={product}
                      store={store}
                      isCheapest={!!(item && comparison?.isBest(item))}
                      onSave={onUpsert}
                      onDelete={onDeleteItem}
                    />
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <ConfirmDialog
        open={!!deleteTarget}
        message={`「${deleteTarget}」をリストから削除しますか？全店舗の価格データも削除されます。`}
        confirmLabel="削除する"
        onConfirm={() => { onDeleteProduct(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ── グリッドの価格セル ────────────────────────────────────
function PriceCell({ item, product, store, isCheapest, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const priceRef = useRef()

  function startEdit() {
    setPrice(item?.price ?? '')
    setNote(item?.note ?? '')
    setEditing(true)
    setTimeout(() => priceRef.current?.select(), 0)
  }

  async function save() {
    if (price === '' || price === null) { cancel(); return }
    setSaving(true)
    await onSave({ storeName: store, productName: product, price, note })
    setSaving(false)
    setEditing(false)
  }

  function cancel() { setEditing(false) }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    return (
      <td className={`${styles.priceCell} ${styles.editingCell}`}>
        <div className={styles.editContent}>
          <input
            ref={priceRef}
            className={styles.cellPriceInput}
            type="number"
            inputMode="decimal"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={handleKeyDown}
            min={0}
            step="0.01"
            placeholder="価格"
          />
          <input
            className={styles.cellNoteInput}
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メモ"
            maxLength={50}
          />
          <div className={styles.editBtns}>
            <button className={styles.editSaveBtn} onClick={save} disabled={saving} aria-label="保存"><IconCheckBold /></button>
            <button className={styles.editCancelBtn} onClick={cancel} aria-label="キャンセル"><IconClose /></button>
          </div>
        </div>
      </td>
    )
  }

  const unitPrice = item ? unitPriceOf(item) : null

  return (
    <td
      className={`${styles.priceCell} ${isCheapest ? styles.cheapest : ''} ${!item ? styles.emptyCell : ''}`}
      onClick={startEdit}
    >
      {item ? (
        <div className={styles.priceContent}>
          <span className={styles.price}>¥{formatPrice(item.price)}</span>
          {unitPrice && <span className={styles.note}>{unitPrice.shortLabel} ¥{formatPrice(unitPrice.value)}</span>}
          {item.note && <span className={styles.note}>{item.note}</span>}
          <button
            className={styles.deleteCell}
            onClick={e => { e.stopPropagation(); onDelete(item.id) }}
            aria-label="削除"
          >×</button>
        </div>
      ) : (
        <span className={styles.noData}>＋</span>
      )}
    </td>
  )
}
