import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
// Tabler Icons（線画・メイン）
import {
  TbMeat, TbPig, TbSausage, TbGrill, TbChefHat,
  TbFishBone, TbMushroom, TbLeaf, TbLeaf2, TbSeedling,
  TbLemon, TbLemon2,
  TbMilk, TbMilkshake,
  TbBottle, TbTeapot, TbGlass, TbGlassFull, TbDroplet,
  TbSalt, TbIceCream,
  TbToiletPaper, TbRazor, TbSpray, TbPills, TbWashMachine, TbVacuumCleaner, TbHandSanitizer, TbBucket,
  TbShoppingCart, TbPackage, TbTag, TbBasket, TbBox, TbStar, TbHeart,
} from 'react-icons/tb'
// Lucide Icons（線画・果物・野菜・食材）
import {
  LuBeef, LuFish, LuEgg, LuEggFried, LuMilk,
  LuCarrot, LuLeafyGreen, LuSprout, LuSalad,
  LuApple, LuGrape, LuCherry, LuBanana,
  LuBeer, LuWine, LuCoffee,
  LuWheat, LuCroissant, LuSoup, LuCandy, LuCake, LuCookie, LuNut,
} from 'react-icons/lu'
// Phosphor Icons（線画・牛・エビ・その他）
import { PiCow, PiShrimp, PiOrange, PiLeaf, PiAvocado, PiPepper, PiCheese } from 'react-icons/pi'
// Game Icons（鶏のみ）
import { GiChicken } from 'react-icons/gi'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import styles from './PricePage.module.css'

function formatPrice(p) {
  return Number(p).toLocaleString('ja-JP', { maximumFractionDigits: 2 })
}

// 使用するアイコンのマップ
const ICON_MAP = {
  // 肉類
  TbMeat, TbPig, LuBeef, GiChicken, TbSausage, TbGrill, TbChefHat,
  // 魚介
  LuFish, TbFishBone, PiShrimp,
  // 野菜（象徴含む）
  LuSprout, LuLeafyGreen, LuSalad,
  LuCarrot, TbMushroom, PiPepper, PiAvocado, TbLeaf, TbLeaf2, TbSeedling, PiLeaf,
  // 果物（象徴含む）
  LuApple, LuGrape,
  LuCherry, LuBanana, PiOrange, TbLemon, TbLemon2,
  // 乳製品・卵
  TbMilk, LuMilk, LuEgg, LuEggFried, PiCheese, TbMilkshake,
  // 飲み物
  TbBottle, LuBeer, LuCoffee, TbTeapot, TbGlass, TbGlassFull, LuWine, TbDroplet,
  // 加工・食材
  LuWheat, LuCroissant, LuSoup, TbSalt, LuCandy, LuCake, LuCookie, TbIceCream, LuNut,
  // 日用品
  TbToiletPaper, TbRazor, TbSpray, TbPills, TbWashMachine, TbVacuumCleaner, TbHandSanitizer, TbBucket,
  // その他
  TbShoppingCart, TbPackage, TbTag, TbBasket, TbBox, TbStar, TbHeart,
  // 牛
  PiCow,
}

// アイコン名を受け取ってコンポーネントを返す
function Icon({ name, size, className, style }) {
  const Comp = ICON_MAP[name] || TbShoppingCart
  return <Comp size={size} className={className} style={style} />
}

// ── アイコン定義 ──────────────────────────────────────────
const ICON_GROUPS = [
  { label: '肉・加工肉',   icons: ['TbMeat','TbPig','PiCow','LuBeef','GiChicken','TbSausage','TbGrill','TbChefHat'] },
  { label: '魚介',        icons: ['LuFish','TbFishBone','PiShrimp'] },
  { label: '野菜',        icons: ['LuSprout','LuLeafyGreen','LuSalad','LuCarrot','PiPepper','TbMushroom','PiAvocado','TbLeaf','TbSeedling'] },
  { label: '果物',        icons: ['LuApple','LuGrape','LuCherry','LuBanana','PiOrange','TbLemon'] },
  { label: '乳製品・卵',   icons: ['TbMilk','LuEgg','LuEggFried','PiCheese','TbMilkshake'] },
  { label: '飲み物',      icons: ['TbBottle','LuBeer','LuCoffee','TbTeapot','TbGlass','LuWine','TbDroplet'] },
  { label: '加工・食材',   icons: ['LuWheat','LuCroissant','LuSoup','TbSalt','LuCandy','LuCake','LuCookie','TbIceCream','LuNut'] },
  { label: '日用品',      icons: ['TbToiletPaper','TbRazor','TbSpray','TbPills','TbWashMachine','TbVacuumCleaner','TbHandSanitizer','TbBucket'] },
  { label: 'その他',      icons: ['TbShoppingCart','TbPackage','TbTag','TbBasket','TbBox','TbStar','TbHeart'] },
]

export default function PricePage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [stores, setStores] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'grid'
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showStoreModal, setShowStoreModal] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchStores = useCallback(async () => {
    const { data } = await supabase
      .from('price_stores')
      .select('*')
      .order('sort_order')
      .order('name')
    if (data) setStores(data)
  }, [])

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('price_items')
      .select('*')
      .order('product_name')
      .order('store_name')
    if (data) setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchStores(), fetchItems()])
  }, [fetchStores, fetchItems])

  useEffect(() => {
    const ch1 = supabase
      .channel('price_items_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_items' }, fetchItems)
      .subscribe()
    const ch2 = supabase
      .channel('price_stores_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_stores' }, fetchStores)
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [fetchItems, fetchStores])

  async function handleUpsert({ storeName, productName, price, note, category, icon }) {
    const payload = {
      family_id: familyMember.family_id,
      store_name: storeName,
      product_name: productName,
      price: Number(price),
      note: note?.trim() || null,
      category: category ?? 'food',
      updated_by: familyMember.name,
      updated_at: new Date().toISOString(),
    }
    if (icon !== undefined) payload.icon = icon

    const { error } = await supabase.from('price_items').upsert(
      payload,
      { onConflict: 'family_id,store_name,product_name' }
    )
    // 同一商品の全行にカテゴリ・アイコンを反映
    if (!error && category) {
      await supabase.from('price_items')
        .update({ category })
        .eq('family_id', familyMember.family_id)
        .eq('product_name', productName)
    }
    if (!error && icon) {
      await supabase.from('price_items')
        .update({ icon })
        .eq('family_id', familyMember.family_id)
        .eq('product_name', productName)
    }
    if (!error) await fetchItems()
    return error
  }

  async function handleIconUpdate(productName, icon) {
    await supabase.from('price_items')
      .update({ icon })
      .eq('family_id', familyMember.family_id)
      .eq('product_name', productName)
    await fetchItems()
  }

  async function handleDeleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('price_items').delete().eq('id', id)
  }

  async function handleAddStore(name) {
    const { error } = await supabase.from('price_stores').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
    })
    if (!error) await fetchStores()
    return error
  }

  async function handleDeleteProduct(productName) {
    setItems(prev => prev.filter(i => i.product_name !== productName))
    await supabase
      .from('price_items')
      .delete()
      .eq('product_name', productName)
      .eq('family_id', familyMember.family_id)
  }

  async function handleDeleteStore(id, name) {
    setStores(prev => prev.filter(s => s.id !== id))
    setItems(prev => prev.filter(i => i.store_name !== name))
    await supabase.from('price_items')
      .delete().eq('store_name', name).eq('family_id', familyMember.family_id)
    await supabase.from('price_stores').delete().eq('id', id)
  }

  // ── Data processing ──
  const storeNames = stores.map(s => s.name)
  const allProducts = [...new Set(items.map(i => i.product_name))].sort()

  // 商品ごとのカテゴリ・アイコン（最初の行から取得）
  const productCategory = {}
  const productIcon = {}
  for (const item of items) {
    if (!productCategory[item.product_name]) {
      productCategory[item.product_name] = item.category ?? 'food'
    }
    if (!productIcon[item.product_name] && item.icon) {
      productIcon[item.product_name] = item.icon
    }
  }

  // カテゴリ＋検索フィルター適用
  const products = allProducts.filter(p => {
    if (categoryFilter !== 'all' && productCategory[p] !== categoryFilter) return false
    if (searchQuery.trim() && !p.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false
    return true
  })

  const lookup = {}
  for (const item of items) {
    if (!lookup[item.product_name]) lookup[item.product_name] = {}
    lookup[item.product_name][item.store_name] = item
  }

  // cheapestInfo[product] = { price: number, store: string }
  const cheapestInfo = {}
  for (const product of products) {
    let min = Infinity, minStore = null
    for (const store of storeNames) {
      const item = lookup[product]?.[store]
      if (item && item.price < min) { min = item.price; minStore = store }
    }
    if (minStore) cheapestInfo[product] = { price: min, store: minStore }
  }

  const isEmpty = !loading && stores.length > 0 && allProducts.length === 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
          <span className={styles.headerTitle}>💰 価格比較</span>
        </div>
        <div className={styles.headerActions}>
          {products.length > 0 && (
            <button
              className={`${styles.viewToggleBtn} ${view === 'grid' ? styles.viewToggleActive : ''}`}
              onClick={() => setView(v => v === 'list' ? 'grid' : 'list')}
              title={view === 'list' ? '一覧表で見る' : 'リストで見る'}
            >
              {view === 'list' ? '📊 一覧' : '📋 リスト'}
            </button>
          )}
          <button className={styles.storeBtn} onClick={() => setShowStoreModal(true)} title="店舗管理">
            🏪 <span className={styles.storeBtnLabel}>店舗</span>
          </button>
          <button
            className={styles.addBtn}
            onClick={() => setShowAddModal(true)}
            disabled={stores.length === 0}
          >
            ＋ 追加
          </button>
        </div>
      </header>

      {/* 検索＋カテゴリフィルター */}
      {!loading && allProducts.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="商品名で検索..."
            />
            {searchQuery && (
              <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="クリア">×</button>
            )}
          </div>
          <div className={styles.categoryChips}>
            {[['all', 'すべて'], ['food', '🥦 食材'], ['daily', '🧴 日用品'], ['other', '📦 その他']].map(([v, label]) => (
              <button
                key={v}
                className={`${styles.chip} ${categoryFilter === v ? styles.chipActive : ''}`}
                onClick={() => setCategoryFilter(v)}
              >{label}</button>
            ))}
          </div>
        </div>
      )}

      <main className={styles.main}>
        {loading ? (
          <LoadingSpinner inline />
        ) : stores.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🏪</span>
            <p>まず店舗を登録してください</p>
            <button className={styles.emptyBtn} onClick={() => setShowStoreModal(true)}>
              店舗を追加する
            </button>
          </div>
        ) : isEmpty ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>💰</span>
            <p>価格データがありません</p>
            <p className={styles.emptyDesc}>「＋ 追加」から商品と価格を登録しましょう</p>
            <button className={styles.emptyBtn} onClick={() => setShowAddModal(true)}>
              価格を追加する
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🔍</span>
            <p>{searchQuery ? `「${searchQuery}」は見つかりません` : 'このカテゴリの商品はありません'}</p>
          </div>
        ) : view === 'list' ? (
          <ProductListView
            products={products}
            cheapestInfo={cheapestInfo}
            productIcon={productIcon}
            onSelect={setSelectedProduct}
          />
        ) : (
          <GridView
            products={products}
            storeNames={storeNames}
            lookup={lookup}
            cheapestInfo={cheapestInfo}
            productIcon={productIcon}
            onUpsert={handleUpsert}
            onDeleteItem={handleDeleteItem}
            onDeleteProduct={handleDeleteProduct}
          />
        )}
      </main>

      {selectedProduct && (
        <CompareSheet
          product={selectedProduct}
          storeNames={storeNames}
          lookup={lookup}
          cheapestInfo={cheapestInfo}
          productIcon={productIcon}
          onUpsert={handleUpsert}
          onDeleteItem={handleDeleteItem}
          onDeleteProduct={name => { handleDeleteProduct(name); setSelectedProduct(null) }}
          onIconUpdate={handleIconUpdate}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {showAddModal && (
        <AddModal
          stores={storeNames}
          productNames={allProducts}
          productCategory={productCategory}
          productIcon={productIcon}
          onSubmit={async data => {
            const err = await handleUpsert(data)
            if (!err) setShowAddModal(false)
            return err
          }}
          onClose={() => setShowAddModal(false)}
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
function ProductListView({ products, cheapestInfo, productIcon, onSelect }) {
  return (
    <ul className={styles.productList}>
      {products.map(product => {
        const best = cheapestInfo[product]
        const icon = productIcon[product]
        return (
          <li key={product} className={styles.productListItem} onClick={() => onSelect(product)}>
            <span className={styles.productListIcon}>
              <Icon name={icon || 'TbShoppingCart'} size={22} />
            </span>
            <span className={styles.productListName}>{product}</span>
            <div className={styles.productListRight}>
              {best ? (
                <div className={styles.bestInfo}>
                  <span className={styles.bestPrice}>¥{formatPrice(best.price)}</span>
                  <span className={styles.bestStore}>{best.store}</span>
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

// ── 店舗別比較シート ──────────────────────────────────────
function CompareSheet({ product, storeNames, lookup, cheapestInfo, productIcon, onUpsert, onDeleteItem, onDeleteProduct, onIconUpdate, onClose }) {
  const best = cheapestInfo[product]
  const registeredCount = storeNames.filter(s => lookup[product]?.[s]).length
  const [confirmState, setConfirmState] = useState(null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const icon = productIcon[product] || null

  return (
    <div className={styles.sheetOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitleRow}>
            <button
              className={styles.iconDisplay}
              onClick={() => setShowIconPicker(true)}
              title="アイコンを変更"
              type="button"
            >
              <span className={styles.iconDisplayEmoji}>
                <Icon name={icon || 'TbShoppingCart'} size={28} />
              </span>
              <span className={styles.iconDisplayEditBadge}>✏</span>
            </button>
            <div>
              <h2 className={styles.sheetTitle}>{product}</h2>
              <p className={styles.sheetMeta}>{registeredCount} / {storeNames.length} 店舗に価格登録済み</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <ul className={styles.compareList}>
          {storeNames.map(store => {
            const item = lookup[product]?.[store]
            const isBest = !!(item && best && item.price === best.price)
            return (
              <CompareRow
                key={store}
                store={store}
                item={item}
                isBest={isBest}
                product={product}
                onUpsert={onUpsert}
                onDeleteItem={onDeleteItem}
              />
            )
          })}
        </ul>

        <button
          className={styles.deleteProductSheetBtn}
          onClick={() => setConfirmState({
            message: `「${product}」をリストから削除しますか？全店舗の価格データも削除されます。`,
            onConfirm: () => onDeleteProduct(product),
          })}
        >
          この商品をリストから削除
        </button>
      </div>

      {showIconPicker && (
        <IconPicker
          value={icon}
          onChange={newIcon => { onIconUpdate(product, newIcon); setShowIconPicker(false) }}
          onClose={() => setShowIconPicker(false)}
        />
      )}

      {confirmState && (
        <DeleteConfirmDialog
          message={confirmState.message}
          onConfirm={() => { confirmState.onConfirm(); setConfirmState(null) }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  )
}

// ── 比較シートの各行 ──────────────────────────────────────
function CompareRow({ store, item, isBest, product, onUpsert, onDeleteItem }) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const priceRef = useRef()

  function startEdit() {
    setPrice(item?.price ?? '')
    setNote(item?.note ?? '')
    setEditing(true)
    setTimeout(() => priceRef.current?.select?.() || priceRef.current?.focus(), 0)
  }

  async function save() {
    if (price === '' || price === null) { cancel(); return }
    setSaving(true)
    await onUpsert({ storeName: store, productName: product, price, note })
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
      <li className={`${styles.compareRow} ${styles.compareRowEditing}`}>
        <span className={styles.compareStoreName}>{store}</span>
        <div className={styles.compareEditArea}>
          <input
            ref={priceRef}
            className={styles.compareInput}
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="価格（円）"
            min={0}
            step="0.01"
          />
          <input
            className={styles.compareNoteInput}
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メモ（任意）"
            maxLength={50}
          />
          <div className={styles.compareEditBtns}>
            <button className={styles.compareEditSave} onClick={save} disabled={saving}>保存</button>
            <button className={styles.compareEditCancel} onClick={cancel}>キャンセル</button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li
      className={`${styles.compareRow} ${isBest ? styles.compareRowBest : ''} ${!item ? styles.compareRowEmpty : ''}`}
      onClick={startEdit}
    >
      <div className={styles.compareLeft}>
        {isBest && <span className={styles.bestBadge}>最安</span>}
        <div className={styles.compareStoreInfo}>
          <span className={styles.compareStoreName}>{store}</span>
          {item?.note && <span className={styles.compareNote}>{item.note}</span>}
        </div>
      </div>
      <div className={styles.compareRight}>
        {item ? (
          <>
            <span className={`${styles.comparePrice} ${isBest ? styles.comparePriceBest : ''}`}>
              ¥{formatPrice(item.price)}
            </span>
            <button
              className={styles.compareDelBtn}
              onClick={e => { e.stopPropagation(); onDeleteItem(item.id) }}
              aria-label="削除"
            >×</button>
          </>
        ) : (
          <span className={styles.compareAddHint}>＋ 価格を入力</span>
        )}
      </div>
    </li>
  )
}

// ── 一覧グリッドビュー ────────────────────────────────────
function GridView({ products, storeNames, lookup, cheapestInfo, productIcon, onUpsert, onDeleteItem, onDeleteProduct }) {
  const [confirmState, setConfirmState] = useState(null)

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
            const minPrice = cheapestInfo[product]?.price ?? Infinity
            const icon = productIcon[product]
            return (
              <tr key={product}>
                <td className={styles.productCell}>
                  <div className={styles.productCellInner}>
                    {icon && <span className={styles.productGridIcon}><Icon name={icon} size={14} /></span>}
                    <span className={styles.productName}>{product}</span>
                    <button
                      className={styles.deleteProductBtn}
                      onClick={() => setConfirmState({
                        message: `「${product}」をリストから削除しますか？全店舗の価格データも削除されます。`,
                        onConfirm: () => onDeleteProduct(product),
                      })}
                      aria-label={`${product}を削除`}
                    >×</button>
                  </div>
                </td>
                {storeNames.map(store => {
                  const item = lookup[product]?.[store]
                  const isCheapest = item && item.price === minPrice
                  return (
                    <PriceCell
                      key={store}
                      item={item}
                      product={product}
                      store={store}
                      isCheapest={isCheapest}
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
      {confirmState && (
        <DeleteConfirmDialog
          message={confirmState.message}
          onConfirm={() => { confirmState.onConfirm(); setConfirmState(null) }}
          onCancel={() => setConfirmState(null)}
        />
      )}
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
            <button className={styles.editSaveBtn} onClick={save} disabled={saving}>✓</button>
            <button className={styles.editCancelBtn} onClick={cancel}>✕</button>
          </div>
        </div>
      </td>
    )
  }

  return (
    <td
      className={`${styles.priceCell} ${isCheapest ? styles.cheapest : ''} ${!item ? styles.emptyCell : ''}`}
      onClick={startEdit}
    >
      {item ? (
        <div className={styles.priceContent}>
          <span className={styles.price}>¥{formatPrice(item.price)}</span>
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

const PRICE_CATEGORIES = [
  { value: 'food',  label: '🥦 食材' },
  { value: 'daily', label: '🧴 日用品' },
  { value: 'other', label: '📦 その他' },
]

// ── 価格追加モーダル ──────────────────────────────────────
function AddModal({ stores, productNames, productCategory, productIcon, onSubmit, onClose }) {
  const [storeName, setStoreName] = useState(stores[0] || '')
  const [productName, setProductName] = useState('')
  const [category, setCategory] = useState('food')
  const [icon, setIcon] = useState(null)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showIconPicker, setShowIconPicker] = useState(false)

  function handleProductChange(e) {
    const val = e.target.value
    setProductName(val)
    if (productCategory[val]) setCategory(productCategory[val])
    if (productIcon[val]) setIcon(productIcon[val])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!storeName || !productName.trim() || price === '') return
    setSubmitting(true)
    setError('')
    const err = await onSubmit({ storeName, productName: productName.trim(), price, note, category, icon })
    if (err) setError('保存に失敗しました')
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>価格を追加・更新</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            店舗
            <select className={styles.input} value={storeName} onChange={e => setStoreName(e.target.value)} required>
              {stores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={styles.label}>
            商品名
            <input
              className={styles.input}
              list="product-list"
              value={productName}
              onChange={handleProductChange}
              placeholder="例: 牛乳 1L"
              maxLength={100}
              required
              autoComplete="off"
            />
            <datalist id="product-list">
              {productNames.map(p => <option key={p} value={p} />)}
            </datalist>
          </label>

          <div className={styles.label}>
            アイコン
            <button
              type="button"
              className={styles.iconSelectBtn}
              onClick={() => setShowIconPicker(true)}
            >
              <span className={styles.iconSelectEmoji}>
                <Icon name={icon || 'TbShoppingCart'} size={26} />
              </span>
              <span className={styles.iconSelectLabel}>{icon ? 'タップして変更' : 'アイコンを選択'}</span>
            </button>
          </div>

          <div className={styles.label}>
            カテゴリ
            <div className={styles.categoryBtns}>
              {PRICE_CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`${styles.categoryBtn} ${category === c.value ? styles.categoryBtnActive : ''}`}
                  onClick={() => setCategory(c.value)}
                >{c.label}</button>
              ))}
            </div>
          </div>
          <label className={styles.label}>
            価格（円）
            <input
              className={styles.input}
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="例: 198.50"
              min={0}
              max={999999}
              step="0.01"
              required
            />
          </label>
          <label className={styles.label}>
            メモ（任意）
            <input
              className={styles.input}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="例: 税込・特売"
              maxLength={100}
            />
          </label>
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.formBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={submitting || !storeName || !productName.trim() || price === ''}
            >
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>

      {showIconPicker && (
        <IconPicker
          value={icon}
          onChange={newIcon => { setIcon(newIcon); setShowIconPicker(false) }}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </div>
  )
}

// ── アイコンピッカー ──────────────────────────────────────
function IconPicker({ value, onChange, onClose }) {
  return (
    <div className={styles.iconPickerOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.iconPickerPanel}>
        <div className={styles.iconPickerHeader}>
          <span className={styles.iconPickerTitle}>アイコンを選択</span>
          <button className={styles.closeBtn} onClick={onClose} type="button">×</button>
        </div>
        <div className={styles.iconPickerBody}>
          {ICON_GROUPS.map(group => (
            <div key={group.label}>
              <div className={styles.iconGroupLabel}>{group.label}</div>
              <div className={styles.iconGrid}>
                {group.icons.map(ico => (
                  <button
                    key={ico}
                    type="button"
                    className={`${styles.iconBtn} ${value === ico ? styles.iconBtnActive : ''}`}
                    onClick={() => onChange(ico)}
                    title={ico.replace(/^Tb/, '')}
                  >
                    <Icon name={ico} size={24} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 店舗管理モーダル ──────────────────────────────────────
function StoreModal({ stores, onAdd, onDelete, onClose }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setError('')
    const err = await onAdd(newName)
    if (err) setError('追加に失敗しました（同名の店舗が既に存在する可能性があります）')
    else setNewName('')
    setAdding(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>店舗管理</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <ul className={styles.storeList}>
          {stores.length === 0 && (
            <li className={styles.storeEmpty}>店舗が登録されていません</li>
          )}
          {stores.map(s => (
            <li key={s.id} className={styles.storeItem}>
              <span className={styles.storeName}>{s.name}</span>
              <button
                className={styles.storeDeleteBtn}
                onClick={() => setConfirmState({
                  message: `「${s.name}」を削除しますか？登録済みの価格データもすべて削除されます。`,
                  onConfirm: () => onDelete(s.id, s.name),
                })}
                aria-label={`${s.name}を削除`}
              >削除</button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAdd} className={styles.storeAddForm}>
          <input
            className={styles.input}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="新しい店舗名を入力..."
            maxLength={50}
            autoComplete="off"
          />
          <button type="submit" className={styles.saveBtn} disabled={adding || !newName.trim()}>
            追加
          </button>
        </form>
        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>
      {confirmState && (
        <DeleteConfirmDialog
          message={confirmState.message}
          onConfirm={() => { confirmState.onConfirm(); setConfirmState(null) }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  )
}

// ── 削除確認ダイアログ ────────────────────────────────────
function DeleteConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className={styles.confirmOverlay} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.confirmDialog}>
        <p className={styles.confirmMessage}>{message}</p>
        <div className={styles.formBtns}>
          <button className={styles.cancelBtn} onClick={onCancel}>キャンセル</button>
          <button className={styles.deleteDangerBtn} onClick={onConfirm}>削除する</button>
        </div>
      </div>
    </div>
  )
}
