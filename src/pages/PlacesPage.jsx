import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { loadGoogleMapsScript } from '../utils/googleMaps'
import ConfirmDialog from '../components/ConfirmDialog'
import BottomNav from '../components/BottomNav'
import styles from './PlacesPage.module.css'


const CATEGORIES = {
  food:  { label: 'グルメ', icon: '🍽️' },
  play:  { label: '遊び',   icon: '🎡' },
  other: { label: 'その他', icon: '📍' },
}

// 「今日はどこ行く？」で使う目的別タグのプリセット
const PRESET_TAGS = [
  { label: 'ラーメン', icon: '🍜' },
  { label: 'カフェ', icon: '☕' },
  { label: '夜景', icon: '🌃' },
  { label: 'デート', icon: '💑' },
  { label: '子供と遊べる', icon: '🧒' },
  { label: '雨の日', icon: '☔' },
  { label: 'ドライブ', icon: '🚗' },
  { label: '焼肉', icon: '🥩' },
  { label: 'スイーツ', icon: '🍰' },
  { label: '公園', icon: '🌳' },
  { label: '温泉', icon: '♨️' },
  { label: '記念日', icon: '🎂' },
]

function tagIcon(label) {
  return PRESET_TAGS.find(t => t.label === label)?.icon ?? '#'
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function PlacesPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [places, setPlaces] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')   // 'all'|'want'|'visited'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedTags, setSelectedTags] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [visitTarget, setVisitTarget] = useState(null)      // place object
  const [editTarget, setEditTarget] = useState(null)        // place object
  const [view, setView] = useState('list')                  // 'list' | 'map'
  const [showRadiusSearch, setShowRadiusSearch] = useState(false)
  const [radiusCenter, setRadiusCenter] = useState(null)    // { lat, lng, address }
  const [radiusKm, setRadiusKm] = useState(5)
  const [prefectureFilter, setPrefectureFilter] = useState('')
  const [recommendPlace, setRecommendPlace] = useState(null)

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

  // Google Maps スクリプトをページロード時に事前読み込み
  useEffect(() => { loadGoogleMapsScript().catch(() => {}) }, [])

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

  // 「今日はここ！」のおすすめ場所を維持・再抽選
  useEffect(() => {
    setRecommendPlace(prev => {
      const pool = places.filter(p => p.status === 'want')
      if (prev && pool.some(p => p.id === prev.id)) return prev
      if (pool.length === 0) return null
      return pool[Math.floor(Math.random() * pool.length)]
    })
  }, [places])

  async function handleAdd({ name, category, memo, address, lat, lng, tags }) {
    await supabase.from('wish_places').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
      category,
      memo: memo?.trim() || null,
      address: address?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      tags: tags ?? [],
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

  async function handleEdit(id, { name, category, memo, address, lat, lng, tags }) {
    await supabase.from('wish_places').update({
      name: name.trim(),
      category,
      memo: memo?.trim() || null,
      address: address?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      tags: tags ?? [],
    }).eq('id', id)
    await fetchAll()
  }

  async function handleDelete(id) {
    await supabase.from('wish_places').delete().eq('id', id)
    await fetchAll()
  }

  // 都道府県抽出（「日本、〒100-0005 東京都…」形式にも対応）
  function extractPrefecture(address) {
    if (!address) return null
    // 数字・〒・記号を除いた日本語文字列＋都道府県の組み合わせを探す
    const m = address.match(/([^\s,、\d〒\-]+[都道府県])/)
    return m ? m[1] : null
  }

  const availablePrefectures = [...new Set(
    places.map(p => extractPrefecture(p.address)).filter(Boolean)
  )].sort()

  // タグ頻度からよく使うタグ上位を抽出（絞り込みチップ用）
  const tagFrequency = {}
  places.forEach(p => (p.tags || []).forEach(t => { tagFrequency[t] = (tagFrequency[t] || 0) + 1 }))
  const topTags = Object.entries(tagFrequency).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 16)
  const tagSuggestions = [...new Set([...PRESET_TAGS.map(t => t.label), ...topTags])]

  // フィルタリング
  const q = searchQuery.trim().toLowerCase()
  const radiusActive = showRadiusSearch && radiusCenter != null
  const filtered = places.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
    if (q) {
      const inName    = p.name?.toLowerCase().includes(q)
      const inAddress = p.address?.toLowerCase().includes(q)
      const inMemo    = p.memo?.toLowerCase().includes(q)
      const inTags    = (p.tags || []).some(t => t.toLowerCase().includes(q))
      if (!inName && !inAddress && !inMemo && !inTags) return false
    }
    if (selectedTags.length > 0) {
      const tags = p.tags || []
      if (!selectedTags.every(t => tags.includes(t))) return false
    }
    if (prefectureFilter && extractPrefecture(p.address) !== prefectureFilter) return false
    if (radiusActive) {
      if (p.lat == null || p.lng == null) return false
      if (haversineKm(radiusCenter.lat, radiusCenter.lng, p.lat, p.lng) > radiusKm) return false
    }
    return true
  })

  // 検索・絞り込みが何も効いていない「ブラウズ中」かどうか（探索導線を出す条件）
  const isBrowsing = statusFilter !== 'visited' && !q && selectedTags.length === 0 &&
    categoryFilter === 'all' && !prefectureFilter && !radiusActive

  const wantPlaces = places.filter(p => p.status === 'want')
  const wantPlacesWithCoords = wantPlaces.filter(p => p.lat != null && p.lng != null)
  const recentPlaces = places.slice(0, 6)

  function toggleTag(t) {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function handleDiscoverTagSelect(label) {
    setSelectedTags(prev => (prev.length === 1 && prev[0] === label) ? [] : [label])
  }

  function handleReroll() {
    setRecommendPlace(prev => {
      const others = wantPlaces.filter(p => p.id !== prev?.id)
      const pool = others.length ? others : wantPlaces
      if (!pool.length) return null
      return pool[Math.floor(Math.random() * pool.length)]
    })
  }

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

      {/* 検索バー */}
      <div className={styles.searchBar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="場所名・タグ・住所で検索（ラーメン、夜景など）"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="クリア">×</button>
          )}
        </div>
        <button
          className={`${styles.radiusToggleBtn} ${showRadiusSearch ? styles.radiusToggleBtnActive : ''}`}
          onClick={() => {
            setShowRadiusSearch(v => !v)
            if (showRadiusSearch) setRadiusCenter(null)
          }}
          aria-label="範囲で絞り込む"
          title="範囲で絞り込む"
        >
          <span className={styles.radiusToggleIcon}>📡</span>
          <span className={styles.radiusToggleLabel}>範囲</span>
          {radiusActive && <span className={styles.radiusActiveDot} />}
        </button>
      </div>

      {/* タグで絞り込む */}
      {topTags.length > 0 && (
        <div className={styles.tagFilterRow}>
          {topTags.map(t => (
            <button
              key={t}
              className={`${styles.chip} ${selectedTags.includes(t) ? styles.chipActive : ''}`}
              onClick={() => toggleTag(t)}
            >{tagIcon(t)} {t}</button>
          ))}
          {selectedTags.length > 0 && (
            <button className={styles.chipClear} onClick={() => setSelectedTags([])}>タグ解除 ×</button>
          )}
        </div>
      )}

      {/* 範囲検索パネル */}
      {showRadiusSearch && (
        <RadiusSearchPanel
          center={radiusCenter}
          radiusKm={radiusKm}
          onCenterChange={setRadiusCenter}
          onRadiusChange={setRadiusKm}
          matchCount={radiusActive ? filtered.length : null}
        />
      )}

      {/* カテゴリチップ + ビュー切り替え */}
      <div className={styles.filterRow}>
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
          {availablePrefectures.length > 0 && (
            <select
              className={`${styles.prefectureSelect} ${prefectureFilter ? styles.prefectureSelectActive : ''}`}
              value={prefectureFilter}
              onChange={e => setPrefectureFilter(e.target.value)}
              aria-label="都道府県で絞り込む"
            >
              <option value="">🗾 都道府県</option>
              {availablePrefectures.map(pref => (
                <option key={pref} value={pref}>{pref}</option>
              ))}
            </select>
          )}
        </div>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('list')}
            aria-label="リスト表示"
            title="リスト"
          >📋</button>
          <button
            className={`${styles.viewBtn} ${view === 'map' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('map')}
            aria-label="地図表示"
            title="地図"
          >🗺</button>
        </div>
      </div>

      <main className={`${styles.main} ${view === 'map' ? styles.mainMap : ''}`}>
        {view === 'map' ? (
          <MapView places={filtered} />
        ) : loading ? (
          <p className={styles.hint}>読み込み中...</p>
        ) : (
          <>
            {isBrowsing && (
              <div className={styles.discoverArea}>
                <RecommendCard place={recommendPlace} onReroll={handleReroll} onOpen={setEditTarget} />
                <DiscoverStrip activeTags={selectedTags} onSelectTag={handleDiscoverTagSelect} />
                {recentPlaces.length > 0 && (
                  <RecentRow places={recentPlaces} onOpen={setEditTarget} />
                )}
                <NearbySection places={wantPlacesWithCoords} onOpen={setEditTarget} />
              </div>
            )}

            {filtered.length === 0 ? (
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
              <>
                {isBrowsing && (
                  <h2 className={styles.sectionTitle}>
                    すべての場所 <span className={styles.sectionCount}>{filtered.length}</span>
                  </h2>
                )}
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
              </>
            )}
          </>
        )}
      </main>

      {showAdd && (
        <AddPlaceModal
          tagSuggestions={tagSuggestions}
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
          tagSuggestions={tagSuggestions}
          onSubmit={async data => { await handleEdit(editTarget.id, data); setEditTarget(null) }}
          onDelete={async () => { await handleDelete(editTarget.id); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ── 「今日はここ！」おすすめカード ──────────────────────
function RecommendCard({ place, onReroll, onOpen }) {
  if (!place) return null
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  return (
    <section className={styles.recommendCard} onClick={() => onOpen(place)}>
      <div className={styles.recommendHeader}>
        <span className={styles.recommendBadge}>✨ 今日はここ！</span>
        <button
          type="button"
          className={styles.rerollBtn}
          onClick={e => { e.stopPropagation(); onReroll() }}
          aria-label="別の場所を提案"
          title="別の場所を提案"
        >🎲</button>
      </div>
      <p className={styles.recommendName}>{cat.icon} {place.name}</p>
      {place.address && <p className={styles.recommendAddress}>📍 {place.address}</p>}
      {place.memo && <p className={styles.recommendMemo}>{place.memo}</p>}
      {place.tags?.length > 0 && (
        <div className={styles.cardTags}>
          {place.tags.slice(0, 4).map(t => <span key={t} className={styles.tagPill}>#{t}</span>)}
        </div>
      )}
    </section>
  )
}

// ── 「今日はどこ行く？」目的別ディスカバー ──────────────
function DiscoverStrip({ activeTags, onSelectTag }) {
  return (
    <section className={styles.discoverSection}>
      <h2 className={styles.sectionTitle}>今日はどこ行く？</h2>
      <div className={styles.discoverStrip}>
        {PRESET_TAGS.map(({ label, icon }) => (
          <button
            key={label}
            className={`${styles.discoverCard} ${activeTags.includes(label) ? styles.discoverCardActive : ''}`}
            onClick={() => onSelectTag(label)}
          >
            <span className={styles.discoverIcon}>{icon}</span>
            <span className={styles.discoverLabel}>{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── 最近追加した場所 ──────────────────────────────────────
function RecentRow({ places, onOpen }) {
  return (
    <section className={styles.horizontalSection}>
      <h2 className={styles.sectionTitle}>最近追加した場所</h2>
      <div className={styles.horizontalScroll}>
        {places.map(p => (
          <MiniPlaceCard key={p.id} place={p} onClick={() => onOpen(p)} />
        ))}
      </div>
    </section>
  )
}

// ── 近くの場所（現在地ベース） ────────────────────────────
function NearbySection({ places, onOpen }) {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  function locate() {
    if (!navigator.geolocation) { setError(true); return }
    setLoading(true)
    setError(false)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLoading(false)
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => { setLoading(false); setError(true) },
      { timeout: 8000 }
    )
  }

  const nearby = location
    ? places
        .map(p => ({ ...p, _distance: haversineKm(location.lat, location.lng, p.lat, p.lng) }))
        .filter(p => p._distance <= 50)
        .sort((a, b) => a._distance - b._distance)
        .slice(0, 6)
    : []

  return (
    <section className={styles.horizontalSection}>
      <div className={styles.sectionHeaderRow}>
        <h2 className={styles.sectionTitle}>近くの場所</h2>
        {location && (
          <button type="button" className={styles.sectionLinkBtn} onClick={locate}>再取得</button>
        )}
      </div>

      {!location && (
        <button type="button" className={styles.nearbyPromptBtn} onClick={locate} disabled={loading}>
          {loading ? '取得中...' : '📍 現在地から近い場所を探す'}
        </button>
      )}
      {!location && error && (
        <p className={styles.hintSmall}>位置情報を取得できませんでした</p>
      )}
      {location && (
        nearby.length === 0 ? (
          <p className={styles.hintSmall}>50km圏内に住所付きの「行きたい」場所がありません</p>
        ) : (
          <div className={styles.horizontalScroll}>
            {nearby.map(p => (
              <MiniPlaceCard key={p.id} place={p} subtitle={`${p._distance.toFixed(1)}km`} onClick={() => onOpen(p)} />
            ))}
          </div>
        )
      )}
    </section>
  )
}

// ── 横スクロール用ミニカード（最近追加／近くの場所で共用） ──
function MiniPlaceCard({ place, subtitle, onClick }) {
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  return (
    <button type="button" className={styles.miniCard} onClick={onClick}>
      <span className={styles.miniCardIcon}>{cat.icon}</span>
      <span className={styles.miniCardName}>{place.name}</span>
      <span className={styles.miniCardSubtitle}>{subtitle ?? (place.address || cat.label)}</span>
    </button>
  )
}

// ── 範囲検索パネル ────────────────────────────────────────
const RADIUS_OPTIONS = [1, 3, 5, 10, 30]

function RadiusSearchPanel({ center, radiusKm, onCenterChange, onRadiusChange, matchCount }) {
  const inputRef = useRef(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    let mounted = true
    loadGoogleMapsScript().then(async () => {
      if (!mounted || !inputRef.current) return
      await window.google.maps.importLibrary('places')
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'jp' },
        fields: ['formatted_address', 'geometry', 'name'],
      })
      ac.addListener('place_changed', () => {
        if (!mounted) return
        const place = ac.getPlace()
        const loc = place.geometry?.location
        if (loc) {
          onCenterChange({
            lat: loc.lat(),
            lng: loc.lng(),
            address: place.formatted_address || place.name || inputRef.current?.value || '',
          })
        }
      })
    }).catch(() => {})
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function useCurrentLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        onCenterChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: '現在地' })
        if (inputRef.current) inputRef.current.value = '現在地'
      },
      () => setLocating(false),
      { timeout: 8000 }
    )
  }

  function handleClear() {
    onCenterChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={styles.radiusPanel}>
      <div className={styles.radiusInputRow}>
        <div className={styles.radiusInputWrapper}>
          <span className={styles.radiusInputIcon}>📍</span>
          <input
            ref={inputRef}
            className={styles.radiusInput}
            type="text"
            placeholder="起点となる住所・場所名を入力..."
            autoComplete="off"
            defaultValue={center?.address === '現在地' ? '現在地' : (center?.address ?? '')}
          />
          {center && (
            <button className={styles.searchClear} onClick={handleClear} aria-label="クリア">×</button>
          )}
        </div>
        <button
          className={`${styles.gpsBtn} ${locating ? styles.gpsBtnLoading : ''}`}
          onClick={useCurrentLocation}
          disabled={locating}
          aria-label="現在地を使う"
          title="現在地を使う"
        >
          {locating ? '...' : '📡'}
        </button>
      </div>

      {center && (
        <div className={styles.radiusKmRow}>
          <span className={styles.radiusLabel}>半径</span>
          {RADIUS_OPTIONS.map(km => (
            <button
              key={km}
              className={`${styles.radiusKmBtn} ${radiusKm === km ? styles.radiusKmBtnActive : ''}`}
              onClick={() => onRadiusChange(km)}
            >{km}km</button>
          ))}
          {matchCount != null && (
            <span className={styles.radiusMatchCount}>{matchCount}件</span>
          )}
        </div>
      )}

      {!center && (
        <p className={styles.radiusHint}>住所を入力するか📡ボタンで現在地を起点に絞り込めます</p>
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

      {place.tags?.length > 0 && (
        <div className={styles.cardTags}>
          {place.tags.slice(0, 4).map(t => <span key={t} className={styles.tagPill}>#{t}</span>)}
          {place.tags.length > 4 && <span className={styles.tagPillMore}>+{place.tags.length - 4}</span>}
        </div>
      )}

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

// ── タグ選択UI（追加・編集モーダル共通） ──────────────────
function TagPicker({ tags, onChange, suggestions }) {
  const [input, setInput] = useState('')

  function addTag(raw) {
    const t = raw.trim()
    if (!t || tags.includes(t) || tags.length >= 8) { setInput(''); return }
    onChange([...tags, t])
    setInput('')
  }

  function removeTag(t) {
    onChange(tags.filter(x => x !== t))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const remainingSuggestions = suggestions.filter(s => !tags.includes(s))

  return (
    <div className={styles.tagPicker}>
      {tags.length > 0 && (
        <div className={styles.tagPickerSelected}>
          {tags.map(t => (
            <span key={t} className={styles.tagPickerChip}>
              #{t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`${t}を削除`}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className={styles.input}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="タグを入力してEnter（例: 夜景、デート）"
        maxLength={20}
      />
      {remainingSuggestions.length > 0 && (
        <div className={styles.tagPickerSuggestions}>
          {remainingSuggestions.slice(0, 10).map(s => (
            <button
              key={s}
              type="button"
              className={styles.tagSuggestionChip}
              onClick={() => addTag(s)}
            >{tagIcon(s)} {s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 場所追加モーダル ──────────────────────────────────────
function AddPlaceModal({ onSubmit, onClose, tagSuggestions }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('food')
  const [memo, setMemo] = useState('')
  const [address, setAddress] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [tags, setTags] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    loadGoogleMapsScript().then(async () => {
      if (!mounted || !inputRef.current) return
      await window.google.maps.importLibrary('places')
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'jp' },
        fields: ['formatted_address', 'geometry', 'name'],
      })
      ac.addListener('place_changed', () => {
        if (!mounted) return
        const place = ac.getPlace()
        setAddress(place.formatted_address || inputRef.current?.value || '')
        setSelectedName(place.name || '')
        const loc = place.geometry?.location
        if (loc) { setLat(loc.lat()); setLng(loc.lng()) }
      })
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    const finalAddress = address || inputRef.current?.value || ''
    await onSubmit({ name, category, memo, address: finalAddress, lat, lng, tags })
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
          <label className={styles.label}>
            住所（任意）
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              defaultValue=""
              placeholder="例: 大阪府大阪市港区海岸通..."
              autoComplete="off"
            />
            {(selectedName || address) && (
              <p className={styles.acSelected}>
                📍 {selectedName || address}
                {selectedName && address && <span className={styles.acAddress}>{address}</span>}
              </p>
            )}
          </label>
          <label className={styles.label}>
            タグ（任意・複数可）
            <TagPicker tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </label>
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
function EditPlaceModal({ place, onSubmit, onDelete, onClose, tagSuggestions }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState(place.category)
  const [memo, setMemo] = useState(place.memo ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [selectedName, setSelectedName] = useState('')
  const [lat, setLat] = useState(place.lat ?? null)
  const [lng, setLng] = useState(place.lng ?? null)
  const [tags, setTags] = useState(place.tags ?? [])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    loadGoogleMapsScript().then(async () => {
      if (!mounted || !inputRef.current) return
      await window.google.maps.importLibrary('places')
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'jp' },
        fields: ['formatted_address', 'geometry', 'name'],
      })
      ac.addListener('place_changed', () => {
        if (!mounted) return
        const p = ac.getPlace()
        setAddress(p.formatted_address || inputRef.current?.value || '')
        setSelectedName(p.name || '')
        const loc = p.geometry?.location
        if (loc) { setLat(loc.lat()); setLng(loc.lng()) }
      })
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    const finalAddress = address || inputRef.current?.value || ''
    await onSubmit({ name, category, memo, address: finalAddress, lat, lng, tags })
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
          <label className={styles.label}>
            住所（任意）
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              defaultValue={place.address ?? ''}
              placeholder="例: 大阪府大阪市港区海岸通..."
              autoComplete="off"
            />
            {(selectedName || address) && (
              <p className={styles.acSelected}>
                📍 {selectedName || address}
                {selectedName && address && <span className={styles.acAddress}>{address}</span>}
              </p>
            )}
          </label>
          <label className={styles.label}>
            タグ（任意・複数可）
            <TagPicker tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </label>
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
            <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>削除</button>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="場所を削除しますか？"
        message={`「${place.name}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        onConfirm={() => { setConfirmDelete(false); onDelete() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

// ── 地図ビュー ────────────────────────────────────────────
function MapView({ places }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const AdvancedMarkerElementRef = useRef(null)
  const markersRef = useRef([])
  const [selectedPlace, setSelectedPlace] = useState(null)

  const placesWithCoords = places.filter(p => p.lat != null && p.lng != null)

  // マップ初期化（マウント時1回のみ・API呼び出しは1回）
  useEffect(() => {
    let mounted = true
    async function init() {
      await loadGoogleMapsScript()
      if (!mounted || !mapRef.current) return
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        window.google.maps.importLibrary('maps'),
        window.google.maps.importLibrary('marker'),
      ])
      AdvancedMarkerElementRef.current = AdvancedMarkerElement
      mapInstanceRef.current = new Map(mapRef.current, {
        center: { lat: 36.2048, lng: 138.2529 },
        zoom: 6,
        mapId: 'DEMO_MAP_ID',
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      })
    }
    init().catch(() => {})
    return () => { mounted = false }
  }, []) // マウント時1回のみ

  // フィルター変更時はマーカーだけ更新（API呼び出しなし）
  useEffect(() => {
    const map = mapInstanceRef.current
    const AdvancedMarkerElement = AdvancedMarkerElementRef.current
    if (!map || !AdvancedMarkerElement) return

    // 既存ピンを削除
    markersRef.current.forEach(m => { m.map = null })
    markersRef.current = []

    if (placesWithCoords.length === 0) return

    // ピンを追加
    placesWithCoords.forEach(place => {
      const pin = document.createElement('div')
      pin.className = `${styles.mapPin}${place.status === 'visited' ? ` ${styles.mapPinVisited}` : ''}`
      pin.textContent = place.status === 'visited' ? '✅' : '📍'
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lng },
        content: pin,
        title: place.name,
      })
      marker.addListener('click', () => setSelectedPlace(place))
      markersRef.current.push(marker)
    })

    // 全ピンが収まるようにフィット
    if (placesWithCoords.length === 1) {
      map.setCenter({ lat: placesWithCoords[0].lat, lng: placesWithCoords[0].lng })
      map.setZoom(14)
    } else {
      const bounds = new window.google.maps.LatLngBounds()
      placesWithCoords.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
      map.fitBounds(bounds, { top: 60, right: 20, bottom: 80, left: 20 })
    }
  }, [placesWithCoords.length, places]) // eslint-disable-line react-hooks/exhaustive-deps

  if (placesWithCoords.length === 0) {
    return (
      <div className={styles.mapEmpty}>
        <span className={styles.mapEmptyIcon}>🗺️</span>
        <p>住所が登録された場所が地図に表示されます</p>
        <p className={styles.mapEmptyDesc}>場所を追加・編集して住所を入力してください</p>
      </div>
    )
  }

  return (
    <div className={styles.mapContainer}>
      <div ref={mapRef} className={styles.mapEl} />
      {selectedPlace && (
        <MapPopup place={selectedPlace} onClose={() => setSelectedPlace(null)} />
      )}
    </div>
  )
}

// ── 地図ピンタップ時のポップアップ ────────────────────────
function MapPopup({ place, onClose }) {
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  const isVisited = place.status === 'visited'
  return (
    <div className={styles.mapPopup}>
      <div className={styles.mapPopupHeader}>
        <span className={styles.mapPopupCat}>{cat.icon}</span>
        <span className={styles.mapPopupName}>{place.name}</span>
        <button className={styles.mapPopupClose} onClick={onClose}>×</button>
      </div>
      {place.address && <p className={styles.mapPopupAddress}>📍 {place.address}</p>}
      <div className={styles.mapPopupMeta}>
        {isVisited && place.rating && (
          <span className={styles.mapPopupRating}>
            {'★'.repeat(place.rating)}{'☆'.repeat(5 - place.rating)}
          </span>
        )}
        {isVisited
          ? <span className={styles.mapPopupVisited}>✅ 行った</span>
          : <span className={styles.mapPopupWant}>🌟 行きたい</span>
        }
      </div>
      {place.memo && <p className={styles.mapPopupMemo}>{place.memo}</p>}
    </div>
  )
}
