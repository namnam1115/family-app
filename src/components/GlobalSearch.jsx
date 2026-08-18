import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  IconSchedule, IconShopping, IconInventory, IconDishes, IconPlaces, IconPrice,
  IconChevronRight,
} from '../lib/icons'
import Modal from './Modal'
import styles from './GlobalSearch.module.css'

const PER_GROUP = 5

const GROUPS = [
  { key: 'schedule',  label: '予定',       Icon: IconSchedule,  path: '/schedule' },
  { key: 'shopping',  label: '買い物',     Icon: IconShopping,  path: '/shopping' },
  { key: 'inventory', label: '在庫',       Icon: IconInventory, path: '/inventory' },
  { key: 'dishes',    label: 'おかず',     Icon: IconDishes,    path: '/dishes' },
  { key: 'places',    label: 'お出かけ',   Icon: IconPlaces,    path: '/places' },
  { key: 'price',     label: '価格',       Icon: IconPrice,     path: '/price' },
]

/**
 * ホームからアプリ横断でデータを探すモーダル。
 * 各アプリの主要テーブルを部分一致で検索し、選ぶとそのアプリへ遷移する。
 */
export default function GlobalSearch({ familyId, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const listIdsRef = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (!familyId || q.length === 0) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        // 買い物アイテムは family_id を持たないため、家族のリスト ID 経由で絞る
        if (!listIdsRef.current) {
          const { data, error: err } = await supabase
            .from('shopping_lists').select('id').eq('family_id', familyId)
          if (err) throw err
          listIdsRef.current = (data ?? []).map(l => l.id)
        }
        const listIds = listIdsRef.current
        const pattern = `%${q}%`
        const [schedule, shopping, inventory, dishes, places, price] = await Promise.all([
          supabase.from('schedule_events').select('id, title')
            .eq('family_id', familyId).ilike('title', pattern).limit(PER_GROUP),
          listIds.length
            ? supabase.from('shopping_items').select('id, name, checked')
                .in('list_id', listIds).ilike('name', pattern).limit(PER_GROUP)
            : Promise.resolve({ data: [] }),
          supabase.from('inventory_items').select('id, name, stock_status')
            .eq('family_id', familyId).ilike('name', pattern).limit(PER_GROUP),
          supabase.from('dishes').select('id, name')
            .eq('family_id', familyId).ilike('name', pattern).limit(PER_GROUP),
          supabase.from('wish_places').select('id, name, status')
            .eq('family_id', familyId).ilike('name', pattern).limit(PER_GROUP),
          supabase.from('price_items').select('id, product_name, store_name, price')
            .eq('family_id', familyId).ilike('product_name', pattern).limit(PER_GROUP),
        ])
        setResults({
          schedule: (schedule.data ?? []).map(r => ({ id: r.id, label: r.title })),
          shopping: (shopping.data ?? []).map(r => ({ id: r.id, label: r.name, sub: r.checked ? '購入済み' : null })),
          inventory: (inventory.data ?? []).map(r => ({ id: r.id, label: r.name, sub: r.stock_status === 'out' ? '切れ' : null })),
          dishes: (dishes.data ?? []).map(r => ({ id: r.id, label: r.name })),
          places: (places.data ?? []).map(r => ({ id: r.id, label: r.name, sub: r.status === 'visited' ? '行った' : null })),
          price: (price.data ?? []).map(r => ({ id: r.id, label: r.product_name, sub: r.store_name })),
        })
        setError(false)
      } catch (err) {
        console.error('横断検索エラー:', err)
        setError(true)
        setResults(null)
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query, familyId])

  const hitGroups = results
    ? GROUPS.filter(g => results[g.key]?.length > 0)
    : []
  const totalHits = hitGroups.reduce((sum, g) => sum + results[g.key].length, 0)

  return (
    <Modal open onClose={onClose} title="家族のデータを検索">
      <input
        className={styles.input}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="予定・買い物・在庫・おかず・お出かけ・価格から探す"
        autoFocus
      />

      <div className={styles.results}>
        {error ? (
          <p className={styles.note}>検索に失敗しました。通信環境を確認してください。</p>
        ) : query.trim().length === 0 ? (
          <p className={styles.note}>キーワードを入力すると、すべてのアプリから探します。</p>
        ) : searching ? (
          <p className={styles.note}>検索中...</p>
        ) : totalHits === 0 ? (
          <p className={styles.note}>「{query.trim()}」に一致するデータはありませんでした。</p>
        ) : (
          hitGroups.map(group => {
            const { Icon } = group
            return (
              <section key={group.key} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  <Icon /> {group.label}
                  <span className={styles.groupCount}>{results[group.key].length}</span>
                </h3>
                {results[group.key].map(row => (
                  <button
                    key={row.id}
                    type="button"
                    className={styles.row}
                    onClick={() => { onClose(); navigate(group.path) }}
                  >
                    <span className={styles.rowLabel}>{row.label}</span>
                    {row.sub && <span className={styles.rowSub}>{row.sub}</span>}
                    <IconChevronRight className={styles.rowChevron} />
                  </button>
                ))}
              </section>
            )
          })
        )}
      </div>
    </Modal>
  )
}
