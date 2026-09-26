import { useRef, useState } from 'react'
import { IconGrocery, IconDaily, IconBox } from '../../lib/icons'
import { formatPrice, formatQuantity, formatUpdatedAt, previewUnitPrice } from '../../lib/price'
import Modal from '../Modal'
import { Icon, IconPicker } from './PriceIcon'
import UnitFields from './UnitFields'
import styles from './Price.module.css'

export const PRICE_CATEGORIES = [
  { value: 'food',  label: '食材',   icon: IconGrocery },
  { value: 'daily', label: '日用品', icon: IconDaily },
  { value: 'other', label: 'その他', icon: IconBox },
]

// 店頭で続けて入力するとき、前回の店舗を選び直さなくて済むよう端末に記憶する
const LAST_STORE_KEY = 'price:lastStore'

function loadLastStore(stores) {
  try {
    const saved = localStorage.getItem(LAST_STORE_KEY)
    if (saved && stores.includes(saved)) return saved
  } catch { /* 取得できなければ先頭の店舗 */ }
  return stores[0] || ''
}

function saveLastStore(store) {
  try { localStorage.setItem(LAST_STORE_KEY, store) } catch { /* 記憶できなくても入力は続けられる */ }
}

/**
 * 価格の追加・更新モーダル。
 * 既存商品を選ぶとカテゴリ・アイコン・単位を引き継ぎ、他店の登録済み価格を参考表示する。
 * 「続けて入力」で店舗を保ったまま次の商品を入力できる。
 *
 * props:
 *   rowsByProduct : { [商品名]: { [店舗名]: price_items の行 } }
 *   initialProduct: 開いたときの商品名（検索語からの登録など）
 */
export default function PriceEntryModal({
  stores, productNames, rowsByProduct, productCategory, productIcon, initialProduct = '',
  onSubmit, onClose,
}) {
  const [storeName, setStoreName] = useState(() => loadLastStore(stores))
  const [productName, setProductName] = useState(initialProduct)
  const [category, setCategory] = useState(productCategory[initialProduct] ?? 'food')
  const [icon, setIcon] = useState(productIcon[initialProduct] ?? null)
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('g')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [showIconPicker, setShowIconPicker] = useState(false)
  const productRef = useRef()
  const formRef = useRef()
  const continueRef = useRef(false)

  const existingRows = rowsByProduct[productName.trim()] ?? {}
  const existingStores = stores.filter(s => existingRows[s])
  const currentRow = existingRows[storeName]

  function handleProductChange(e) {
    const val = e.target.value
    setProductName(val)
    const key = val.trim()
    if (productCategory[key]) setCategory(productCategory[key])
    if (productIcon[key]) setIcon(productIcon[key])
    // 同じ商品は同じ単位で比べることが多いので、登録済みの単位を引き継ぐ
    const knownUnit = Object.values(rowsByProduct[key] ?? {}).map(r => r.unit).find(Boolean)
    if (knownUnit && quantity === '') setUnit(knownUnit)
  }

  function selectStore(store) {
    setStoreName(store)
    saveLastStore(store)
  }

  function resetForNext(savedName) {
    setProductName('')
    setPrice('')
    setQuantity('')
    setNote('')
    setIcon(null)
    setCategory('food')
    setSavedMessage(`「${savedName}」を保存しました。続けて入力できます`)
    productRef.current?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const name = productName.trim()
    if (!storeName || !name || price === '') return
    const keepOpen = continueRef.current
    continueRef.current = false
    setSubmitting(true)
    setError('')
    const err = await onSubmit({ storeName, productName: name, price, note, category, icon, quantity, unit }, { keepOpen })
    setSubmitting(false)
    if (err) { setError('保存に失敗しました'); return }
    saveLastStore(storeName)
    if (keepOpen) resetForNext(name)
  }

  const preview = previewUnitPrice(price, quantity, unit)
  const canSubmit = !submitting && storeName && productName.trim() && price !== ''

  return (
    <>
      <Modal open onClose={onClose} title="価格を追加・更新">
      <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
        {savedMessage && <p className={styles.savedMessage} role="status">{savedMessage}</p>}

        <div className={styles.label}>
          店舗
          <div className={styles.storeChips} role="radiogroup" aria-label="店舗">
            {stores.map(s => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={storeName === s}
                className={`${styles.categoryBtn} ${storeName === s ? styles.categoryBtnActive : ''}`}
                onClick={() => selectStore(s)}
              >{s}</button>
            ))}
          </div>
        </div>

        <label className={styles.label}>
          商品名
          <input
            ref={productRef}
            className={styles.input}
            list="product-list"
            value={productName}
            onChange={handleProductChange}
            placeholder="例: 牛乳"
            maxLength={100}
            required
            autoComplete="off"
          />
          <datalist id="product-list">
            {productNames.map(p => <option key={p} value={p} />)}
          </datalist>
        </label>

        {existingStores.length > 0 && (
          <div className={styles.existingPrices}>
            <span className={styles.existingPricesTitle}>登録済みの価格（保存すると選択中の店舗の価格を更新）</span>
            <ul className={styles.existingPricesList}>
              {existingStores.map(s => {
                const row = existingRows[s]
                const qty = formatQuantity(row)
                return (
                  <li key={s} className={s === storeName ? styles.existingPriceCurrent : ''}>
                    <span>{s}</span>
                    <span>
                      ¥{formatPrice(row.price)}{qty && `（${qty}）`}
                      <span className={styles.existingPriceDate}> {formatUpdatedAt(row.updated_at)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <label className={styles.label}>
          価格（円）
          <input
            className={styles.input}
            type="number"
            inputMode="decimal"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder={currentRow ? `前回: ${formatPrice(currentRow.price)}` : '例: 198'}
            min={0}
            max={999999}
            step="0.01"
            required
          />
        </label>

        <div className={styles.label}>
          内容量（任意・サイズ違いを単価で比較）
          <UnitFields
            quantity={quantity}
            unit={unit}
            onQuantityChange={setQuantity}
            onUnitChange={setUnit}
          />
          {preview && <span className={styles.unitPreview}>{preview}</span>}
        </div>

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

        <div className={styles.label}>
          カテゴリ・アイコン
          <div className={styles.categoryBtns}>
            <button
              type="button"
              className={styles.iconSelectBtn}
              onClick={() => setShowIconPicker(true)}
              aria-label={icon ? 'アイコンを変更' : 'アイコンを選択'}
            >
              <span className={styles.iconSelectEmoji}>
                <Icon name={icon || 'TbShoppingCart'} size={22} />
              </span>
            </button>
            {PRICE_CATEGORIES.map(c => (
              <button
                key={c.value}
                type="button"
                className={`${styles.categoryBtn} ${category === c.value ? styles.categoryBtnActive : ''}`}
                onClick={() => setCategory(c.value)}
              ><c.icon /> {c.label}</button>
            ))}
          </div>
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.formBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>閉じる</button>
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={!canSubmit}
            onClick={() => { continueRef.current = true; formRef.current?.requestSubmit() }}
          >
            続けて入力
          </button>
          <button type="submit" className={styles.saveBtn} disabled={!canSubmit}>
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
      </Modal>

      {showIconPicker && (
        <IconPicker
          value={icon}
          onChange={newIcon => { setIcon(newIcon); setShowIconPicker(false) }}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </>
  )
}
