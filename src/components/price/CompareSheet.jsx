import { useRef, useState } from 'react'
import { IconEdit, IconShopping } from '../../lib/icons'
import {
  formatPrice, formatQuantity, formatDiff, formatUpdatedAt, isStale,
  unitPriceOf, previewUnitPrice,
} from '../../lib/price'
import AddToShoppingListModal from '../AddToShoppingListModal'
import ConfirmDialog from '../ConfirmDialog'
import { Icon, IconPicker } from './PriceIcon'
import UnitFields from './UnitFields'
import styles from './Price.module.css'

/**
 * 1 商品の店舗別比較シート。安い順に並べ、最安との差・単価・更新日を並べて見比べられるようにする。
 *
 * props:
 *   product    : 商品名
 *   storeNames : 店舗名（並び順どおり）
 *   rowByStore : { [店舗名]: price_items の行 }
 *   comparison : buildComparison() の結果（未登録なら null）
 */
export default function CompareSheet({
  product, storeNames, rowByStore, comparison, icon, familyMember,
  onUpsert, onDeleteItem, onDeleteProduct, onIconUpdate, onClose,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showAddToShopping, setShowAddToShopping] = useState(false)
  const [addedMessage, setAddedMessage] = useState('')

  const registered = storeNames.filter(s => rowByStore[s])
  const unregistered = storeNames.filter(s => !rowByStore[s])
  const sortedStores = comparison
    ? [...registered].sort((a, b) => comparison.scoreOf(rowByStore[a]) - comparison.scoreOf(rowByStore[b]))
    : registered
  // 未登録の店で内容量を入れるとき、ほかの店と同じ単位を初期値にする
  const defaultUnit = registered.map(s => rowByStore[s].unit).find(Boolean) ?? 'g'
  const best = comparison?.best

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
              aria-label="アイコンを変更"
              type="button"
            >
              <span className={styles.iconDisplayEmoji}>
                <Icon name={icon || 'TbShoppingCart'} size={28} />
              </span>
              <span className={styles.iconDisplayEditBadge}><IconEdit /></span>
            </button>
            <div>
              <h2 className={styles.sheetTitle}>{product}</h2>
              <p className={styles.sheetMeta}>
                {registered.length} / {storeNames.length} 店舗に価格登録済み
                {comparison?.byUnit && ` ・ ${comparison.unitLabel}の単価で比較`}
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <ul className={styles.compareList}>
          {[...sortedStores, ...unregistered].map(store => {
            const item = rowByStore[store]
            return (
              <CompareRow
                key={store}
                store={store}
                item={item}
                isBest={!!(item && comparison?.isBest(item))}
                diff={item && comparison ? formatDiff(comparison, item) : ''}
                defaultUnit={defaultUnit}
                product={product}
                onUpsert={onUpsert}
                onDeleteItem={onDeleteItem}
              />
            )
          })}
        </ul>
        <p className={styles.compareHint}>内容量を入れると、サイズ違いでも単価で比較できます</p>

        <button
          type="button"
          className={styles.addToShoppingBtn}
          onClick={() => setShowAddToShopping(true)}
        >
          <IconShopping /> 買い物リストに追加
        </button>

        {addedMessage && <p className={styles.addedMessage}>{addedMessage}</p>}

        <button className={styles.deleteProductSheetBtn} onClick={() => setConfirmOpen(true)}>
          この商品をリストから削除
        </button>
      </div>

      {showAddToShopping && (
        <AddToShoppingListModal
          items={[{
            key: product,
            name: product,
            // 最安店とその価格をメモに残し、店頭で判断できるようにする
            memo: best ? `最安: ${best.store_name} ${formatPrice(best.price)}` : null,
          }]}
          familyMember={familyMember}
          onAdded={() => setAddedMessage('買い物リストに追加しました')}
          onClose={() => setShowAddToShopping(false)}
        />
      )}

      {showIconPicker && (
        <IconPicker
          value={icon}
          onChange={newIcon => { onIconUpdate(product, newIcon); setShowIconPicker(false) }}
          onClose={() => setShowIconPicker(false)}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        message={`「${product}」をリストから削除しますか？全店舗の価格データも削除されます。`}
        confirmLabel="削除する"
        onConfirm={() => { setConfirmOpen(false); onDeleteProduct(product) }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

// ── 比較シートの各行 ──────────────────────────────────────
function CompareRow({ store, item, isBest, diff, defaultUnit, product, onUpsert, onDeleteItem }) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState(defaultUnit)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const priceRef = useRef()

  function startEdit() {
    setPrice(item?.price ?? '')
    setQuantity(item?.quantity ?? '')
    setUnit(item?.unit ?? defaultUnit)
    setNote(item?.note ?? '')
    setError('')
    setEditing(true)
    setTimeout(() => priceRef.current?.select?.() || priceRef.current?.focus(), 0)
  }

  async function save() {
    if (price === '' || price === null) { cancel(); return }
    setSaving(true)
    const err = await onUpsert({ storeName: store, productName: product, price, note, quantity, unit })
    setSaving(false)
    if (err) { setError('保存に失敗しました'); return }
    setEditing(false)
  }

  function cancel() { setEditing(false) }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    const preview = previewUnitPrice(price, quantity, unit)
    return (
      <li className={`${styles.compareRow} ${styles.compareRowEditing}`}>
        <span className={styles.compareStoreName}>{store}</span>
        <div className={styles.compareEditArea}>
          <input
            ref={priceRef}
            className={styles.compareInput}
            type="number"
            inputMode="decimal"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="価格（円）"
            min={0}
            step="0.01"
            aria-label="価格（円）"
          />
          <UnitFields
            compact
            quantity={quantity}
            unit={unit}
            onQuantityChange={setQuantity}
            onUnitChange={setUnit}
            onKeyDown={handleKeyDown}
          />
          {preview && <span className={styles.unitPreview}>{preview}</span>}
          <input
            className={styles.compareNoteInput}
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メモ（任意・例: 特売）"
            maxLength={50}
            aria-label="メモ"
          />
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.compareEditBtns}>
            <button className={styles.compareEditSave} onClick={save} disabled={saving}>保存</button>
            <button className={styles.compareEditCancel} onClick={cancel}>キャンセル</button>
          </div>
        </div>
      </li>
    )
  }

  const unitPrice = item ? unitPriceOf(item) : null
  const quantityText = item ? formatQuantity(item) : ''

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
          {item?.updated_at && (
            <span className={`${styles.compareUpdated} ${isStale(item.updated_at) ? styles.compareUpdatedStale : ''}`}>
              {formatUpdatedAt(item.updated_at)}更新{item.updated_by ? `・${item.updated_by}` : ''}
            </span>
          )}
        </div>
      </div>
      <div className={styles.compareRight}>
        {item ? (
          <>
            <div className={styles.comparePriceBlock}>
              <span className={`${styles.comparePrice} ${isBest ? styles.comparePriceBest : ''}`}>
                ¥{formatPrice(item.price)}
              </span>
              {(quantityText || unitPrice) && (
                <span className={styles.compareUnit}>
                  {[quantityText, unitPrice && `¥${formatPrice(unitPrice.value)}/${unitPrice.shortLabel}`].filter(Boolean).join('・')}
                </span>
              )}
              {diff && <span className={styles.compareDiff}>{diff}</span>}
            </div>
            <button
              className={styles.compareDelBtn}
              onClick={e => { e.stopPropagation(); onDeleteItem(item.id) }}
              aria-label={`${store}の価格を削除`}
            >×</button>
          </>
        ) : (
          <span className={styles.compareAddHint}>＋ 価格を入力</span>
        )}
      </div>
    </li>
  )
}
