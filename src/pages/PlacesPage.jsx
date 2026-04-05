import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { loadGoogleMapsScript } from '../utils/googleMaps'
import styles from './PlacesPage.module.css'

const CATEGORIES = {
  food:  { label: 'グルメ', icon: '🍽️' },
  play:  { label: '遊び',   icon: '🎡' },
  other: { label: 'その他', icon: '📍' },
}

export default function PlacesPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [places, setPlaces] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')   // 'all'|'want'|'visited'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [visitTarget, setVisitTarget] = useState(null)      // place object
  const [editTarget, setEditTarget] = useState(null)        // place object

  const fetchAll = useCallback(async () => {
    if (!familyMember?.family_id) return
    const fid = familyMember.family_id
    const [{ data: pl }, { data: mem }] = await Promise.all([
      supabase
        .from('wish_places')
        .select('*, added_by_member:family_members!wish_places_added_by_fkey(id, name)')
        .eq('family_id', fid)
        .order('created_at', { ascending: false }),
      supabase.from('family_members').select('id, name').eq('family_id', fid),
    ])
    if (pl) setPlaces(pl)
    if (mem) setMembers(mem)
    setLoading(false)
  }, [familyMember?.family_id])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!familyMember?.family_id) return
    const ch = supabase
      .channel('wish_places_rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'wish_places',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [familyMember?.family_id, fetchAll])

  async function handleAdd({ name, category, memo, address }) {
    await supabase.from('wish_places').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
      category,
      memo: memo?.trim() || null,
      address: address?.trim() || null,
      added_by: familyMember.id,
    })
    await fetchAll()
  }

  async function handleVisit(id, { visitedAt, rating, review }) {
    await supabase.from('wish_places').update({
      status: 'visited',
      visited_at: visitedAt || null,
      rating: rating || null,
      review: review?.trim() || null,
    }).eq('id', id)
    await fetchAll()
  }

  async function handleEdit(id, { name, category, memo, address }) {
    await supabase.from('wish_places').update({
      name: name.trim(),
      category,
      memo: memo?.trim() || null,
      address: address?.trim() || null,
    }).eq('id', id)
    await fetchAll()
  }

  async function handleDelete(id) {
    await supabase.from('wish_places').delete().eq('id', id)
    await fetchAll()
  }

  // フィルタリング
  const filtered = places.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
    return true
  })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る">
          <BsHouseFill />
        </button>
        <h1 className={styles.headerTitle}>📍 お出かけリスト</h1>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>＋ 追加</button>
      </header>

      {/* ステータスタブ */}
      <div className={styles.statusTabs}>
        {[['all', 'すべて'], ['want', '行きたい'], ['visited', '行った']].map(([v, label]) => (
          <button
            key={v}
            className={`${styles.statusTab} ${statusFilter === v ? styles.statusTabActive : ''}`}
            onClick={() => setStatusFilter(v)}
          >{label}</button>
        ))}
      </div>

      {/* カテゴリチップ */}
      <div className={styles.categoryChips}>
        <button
          className={`${styles.chip} ${categoryFilter === 'all' ? styles.chipActive : ''}`}
          onClick={() => setCategoryFilter('all')}
        >すべて</button>
        {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
          <button
            key={key}
            className={`${styles.chip} ${categoryFilter === key ? styles.chipActive : ''}`}
            onClick={() => setCategoryFilter(key)}
          >{icon} {label}</button>
        ))}
      </div>

      <main className={styles.main}>
        {loading ? (
          <p className={styles.hint}>読み込み中...</p>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              {statusFilter === 'visited' ? '✅' : '📍'}
            </span>
            <p>{statusFilter === 'visited' ? 'まだ行った場所がありません' : '行きたい場所を追加しましょう'}</p>
            {statusFilter !== 'visited' && (
              <button className={styles.emptyBtn} onClick={() => setShowAdd(true)}>
                場所を追加する
              </button>
            )}
          </div>
        ) : (
          <ul className={styles.placeList}>
            {filtered.map(place => (
              <PlaceCard
                key={place.id}
                place={place}
                onEdit={() => setEditTarget(place)}
                onVisit={() => setVisitTarget(place)}
              />
            ))}
          </ul>
        )}
      </main>

      {showAdd && (
        <AddPlaceModal
          onSubmit={async data => { await handleAdd(data); setShowAdd(false) }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {visitTarget && (
        <VisitModal
          place={visitTarget}
          onSubmit={async data => { await handleVisit(visitTarget.id, data); setVisitTarget(null) }}
          onClose={() => setVisitTarget(null)}
        />
      )}

      {editTarget && (
        <EditPlaceModal
          place={editTarget}
          onSubmit={async data => { await handleEdit(editTarget.id, data); setEditTarget(null) }}
          onDelete={async () => { await handleDelete(editTarget.id); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

// ── 場所カード ────────────────────────────────────────────
function PlaceCard({ place, onEdit, onVisit }) {
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  const isVisited = place.status === 'visited'

  function openMap(e) {
    e.stopPropagation()
    const query = place.address || place.name
    window.open(
      `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <li className={`${styles.card} ${isVisited ? styles.cardVisited : ''}`} onClick={onEdit}>
      <div className={styles.cardTop}>
        <span className={styles.categoryBadge}>{cat.icon} {cat.label}</span>
        {isVisited && place.rating && (
          <span className={styles.ratingBadge}>
            {'★'.repeat(place.rating)}{'☆'.repeat(5 - place.rating)}
          </span>
        )}
        {isVisited && <span className={styles.visitedBadge}>✅ 行った</span>}
      </div>

      <p className={styles.placeName}>{place.name}</p>

      {place.memo && <p className={styles.placeMemo}>{place.memo}</p>}
      {place.address && (
        <button
          className={styles.placeAddress}
          onClick={e => { e.stopPropagation(); openMap(e) }}
          title="地図で確認"
        >📍 {place.address}</button>
      )}
      {isVisited && place.review && <p className={styles.placeReview}>💬 {place.review}</p>}

      <div className={styles.cardBottom}>
        <div className={styles.cardMeta}>
          {place.added_by_member && (
            <span className={styles.addedBy}>{place.added_by_member.name}が追加</span>
          )}
          {isVisited && place.visited_at && (
            <span className={styles.visitedAt}>
              {new Date(place.visited_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}に訪問
            </span>
          )}
        </div>
        <div className={styles.cardActions}>
          <button
            className={styles.mapBtn}
            onClick={openMap}
            aria-label="地図を開く"
            title="Google Mapsで開く"
          >📍 地図</button>
          {!isVisited && (
            <button
              className={styles.visitBtn}
              onClick={e => { e.stopPropagation(); onVisit() }}
            >行った！</button>
          )}
        </div>
      </div>
    </li>
  )
}

// ── 場所追加モーダル ──────────────────────────────────────
function AddPlaceModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('food')
  const [memo, setMemo] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const acContainerRef = useRef(null)
  const acElementRef = useRef(null)

  useEffect(() => {
    let mounted = true
    loadGoogleMapsScript().then(async () => {
      if (!mounted || !acContainerRef.current) return
      // StrictMode 対策: 既存の要素を削除してから追加
      acContainerRef.current.innerHTML = ''
      const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places')
      const element = new PlaceAutocompleteElement({ componentRestrictions: { country: 'jp' } })
      acElementRef.current = element
      acContainerRef.current.appendChild(element)
      element.addEventListener('gmp-placeselect', async ({ place }) => {
        try {
          await place.fetchFields({ fields: ['formattedAddress'] })
          if (mounted) setAddress(place.formattedAddress || element.value || '')
        } catch {
          if (mounted) setAddress(element.value || '')
        }
      })
    }).catch(() => {})
    return () => {
      mounted = false
      acElementRef.current = null
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    // gmp-placeselect が state に反映済みなら address を、未反映なら element.value をフォールバック
    const finalAddress = address || acElementRef.current?.value || ''
    await onSubmit({ name, category, memo, address: finalAddress })
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>行きたい場所を追加</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            場所名
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: 海遊館、一蘭 梅田店..."
              maxLength={100}
              autoFocus
              required
            />
          </label>
          <label className={styles.label}>
            カテゴリ
            <div className={styles.categorySelect}>
              {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.categoryOption} ${category === key ? styles.categoryOptionActive : ''}`}
                  onClick={() => setCategory(key)}
                >{icon} {label}</button>
              ))}
            </div>
          </label>
          <div className={styles.label}>
            住所（任意）
            <div ref={acContainerRef} className={styles.acContainer} />
            {address && <p className={styles.acSelected}>📍 {address}</p>}
          </div>
          <label className={styles.label}>
            メモ（任意）
            <input
              className={styles.input}
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="例: 友達にすすめられた、子どもと行きたい..."
              maxLength={200}
            />
          </label>
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

// ── 訪問記録モーダル ──────────────────────────────────────
function VisitModal({ place, onSubmit, onClose }) {
  const [visitedAt, setVisitedAt] = useState(new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await onSubmit({ visitedAt, rating, review })
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>「{place.name}」に行った！</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            訪問日
            <input
              className={styles.input}
              type="date"
              value={visitedAt}
              onChange={e => setVisitedAt(e.target.value)}
            />
          </label>
          <div className={styles.label}>
            評価
            <div className={styles.starRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.starBtn} ${n <= rating ? styles.starActive : ''}`}
                  onClick={() => setRating(n === rating ? 0 : n)}
                  aria-label={`${n}点`}
                >★</button>
              ))}
              {rating > 0 && (
                <button type="button" className={styles.clearRating} onClick={() => setRating(0)}>
                  クリア
                </button>
              )}
            </div>
          </div>
          <label className={styles.label}>
            ひとことレビュー（任意）
            <input
              className={styles.input}
              value={review}
              onChange={e => setReview(e.target.value)}
              placeholder="例: 最高だった！また行きたい..."
              maxLength={200}
            />
          </label>
          <div className={styles.formBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting}>
              {submitting ? '保存中...' : '記録する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 場所編集モーダル ──────────────────────────────────────
function EditPlaceModal({ place, onSubmit, onDelete, onClose }) {
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState(place.category)
  const [memo, setMemo] = useState(place.memo ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [submitting, setSubmitting] = useState(false)
  const acContainerRef = useRef(null)
  const acElementRef = useRef(null)

  useEffect(() => {
    let mounted = true
    loadGoogleMapsScript().then(async () => {
      if (!mounted || !acContainerRef.current) return
      acContainerRef.current.innerHTML = ''
      const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places')
      const element = new PlaceAutocompleteElement({ componentRestrictions: { country: 'jp' } })
      if (place.address) element.value = place.address
      acElementRef.current = element
      acContainerRef.current.appendChild(element)
      element.addEventListener('gmp-placeselect', async ({ place: p }) => {
        try {
          await p.fetchFields({ fields: ['formattedAddress'] })
          if (mounted) setAddress(p.formattedAddress || element.value || '')
        } catch {
          if (mounted) setAddress(element.value || '')
        }
      })
    }).catch(() => {})
    return () => {
      mounted = false
      acElementRef.current = null
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    const finalAddress = address || acElementRef.current?.value || ''
    await onSubmit({ name, category, memo, address: finalAddress })
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>場所を編集</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            場所名
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label className={styles.label}>
            カテゴリ
            <div className={styles.categorySelect}>
              {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.categoryOption} ${category === key ? styles.categoryOptionActive : ''}`}
                  onClick={() => setCategory(key)}
                >{icon} {label}</button>
              ))}
            </div>
          </label>
          <div className={styles.label}>
            住所（任意）
            <div ref={acContainerRef} className={styles.acContainer} />
            {address && <p className={styles.acSelected}>📍 {address}</p>}
          </div>
          <label className={styles.label}>
            メモ（任意）
            <input
              className={styles.input}
              value={memo}
              onChange={e => setMemo(e.target.value)}
              maxLength={200}
            />
          </label>
          <div className={styles.formBtns}>
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
