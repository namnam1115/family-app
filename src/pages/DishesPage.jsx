import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import BottomNav from '../components/BottomNav'
import styles from './DishesPage.module.css'

// ── ユーティリティ ────────────────────────────────────────

function extractYouTubeId(url) {
  if (!url) return null
  const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/)
  if (shortsMatch) return shortsMatch[1]
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/)
  if (shortMatch) return shortMatch[1]
  const watchMatch = url.match(/[?&]v=([^?&/]+)/)
  if (watchMatch) return watchMatch[1]
  return null
}

function getThumbnailUrl(dish) {
  if (dish.image_url) return dish.image_url
  const ytId = extractYouTubeId(dish.url)
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
  return null
}

function getPlatform(url) {
  if (!url) return null
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('tiktok.com')) return 'tiktok'
  return 'web'
}

const PLATFORM_LABELS = {
  youtube: { icon: '🎬', label: 'YouTube' },
  tiktok:  { icon: '🎵', label: 'TikTok' },
  web:     { icon: '🌐', label: 'Web' },
}

// ── メインページ ──────────────────────────────────────────

export default function DishesPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [dishes, setDishes] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [showManageCategories, setShowManageCategories] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!familyMember?.family_id) return
    const fid = familyMember.family_id
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase
        .from('dishes')
        .select('*, category:dish_categories(id, name)')
        .eq('family_id', fid)
        .order('created_at', { ascending: false }),
      supabase
        .from('dish_categories')
        .select('*')
        .eq('family_id', fid)
        .order('sort_order')
        .order('name'),
    ])
    if (d) setDishes(d)
    if (c) setCategories(c)
    setLoading(false)
  }, [familyMember?.family_id])

  const fetchSingleDish = useCallback(async (id) => {
    const { data } = await supabase
      .from('dishes')
      .select('*, category:dish_categories(id, name)')
      .eq('id', id)
      .single()
    return data
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!familyMember?.family_id) return

    async function handleDishChange(payload) {
      if (payload.eventType === 'DELETE') {
        setDishes(prev => prev.filter(d => d.id !== payload.old.id))
      } else {
        // INSERT/UPDATE: payload.new にはjoinデータがないので1行だけ取得
        const dish = await fetchSingleDish(payload.new.id)
        if (!dish) return
        setDishes(prev => {
          const exists = prev.some(d => d.id === dish.id)
          if (exists) return prev.map(d => d.id === dish.id ? dish : d)
          return [dish, ...prev]  // INSERT: created_at DESC 順を維持
        })
      }
    }

    const ch = supabase
      .channel('dishes_rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dishes',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, handleDishChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dish_categories',
        filter: `family_id=eq.${familyMember.family_id}`,
      }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [familyMember?.family_id, fetchAll, fetchSingleDish])

  async function handleAddDish({ name, categoryId, url, imageUrl }) {
    await supabase.from('dishes').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
      category_id: categoryId || null,
      url: url?.trim() || null,
      image_url: imageUrl?.trim() || null,
      added_by: familyMember.id,
    })
  }

  async function handleReview(id, { rating, review }) {
    await supabase.from('dishes').update({
      cooked_at: new Date().toISOString(),
      rating: rating || null,
      review: review?.trim() || null,
    }).eq('id', id)
  }

  async function handleEditDish(id, { name, categoryId, url, imageUrl }) {
    await supabase.from('dishes').update({
      name: name.trim(),
      category_id: categoryId || null,
      url: url?.trim() || null,
      image_url: imageUrl?.trim() || null,
    }).eq('id', id)
  }

  async function handleDelete(id) {
    await supabase.from('dishes').delete().eq('id', id)
  }

  async function handleAddCategory(name) {
    await supabase.from('dish_categories').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
      sort_order: categories.length,
    })
  }

  async function handleDeleteCategory(id) {
    await supabase.from('dish_categories').delete().eq('id', id)
  }

  const filtered = dishes
    .filter(d => categoryFilter === 'all' || d.category_id === categoryFilter)
    .filter(d => !searchQuery.trim() || d.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る">
          <BsHouseFill />
        </button>
        <h1 className={styles.headerTitle}>🍳 食べたいおかず</h1>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>＋ 追加</button>
      </header>

      {/* 検索バー */}
      <div className={styles.searchBar}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          className={styles.searchInput}
          type="search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="料理名で検索..."
          aria-label="料理名で検索"
        />
        {searchQuery && (
          <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="検索をクリア">×</button>
        )}
      </div>

      {/* カテゴリフィルター */}
      <div className={styles.categoryBar}>
        <button
          className={`${styles.chip} ${categoryFilter === 'all' ? styles.chipActive : ''}`}
          onClick={() => setCategoryFilter('all')}
        >すべて</button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`${styles.chip} ${categoryFilter === cat.id ? styles.chipActive : ''}`}
            onClick={() => setCategoryFilter(cat.id)}
          >{cat.name}</button>
        ))}
        <button
          className={styles.chipManage}
          onClick={() => setShowManageCategories(true)}
          aria-label="カテゴリを管理"
        >⚙️</button>
      </div>

      <main className={styles.main}>
        {loading ? (
          <p className={styles.hint}>読み込み中...</p>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🍳</span>
            <p>おかずを追加しましょう</p>
            <button className={styles.emptyBtn} onClick={() => setShowAdd(true)}>
              おかずを追加する
            </button>
          </div>
        ) : (
          <ul className={styles.dishList}>
            {filtered.map(dish => (
              <DishCard
                key={dish.id}
                dish={dish}
                onReview={() => setReviewTarget(dish)}
                onEdit={() => setEditTarget(dish)}
              />
            ))}
          </ul>
        )}
      </main>

      {showAdd && (
        <AddDishModal
          categories={categories}
          onSubmit={async data => { await handleAddDish(data); setShowAdd(false) }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          dish={reviewTarget}
          onSubmit={async data => { await handleReview(reviewTarget.id, data); setReviewTarget(null) }}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {editTarget && (
        <EditDishModal
          dish={editTarget}
          categories={categories}
          onSubmit={async data => { await handleEditDish(editTarget.id, data); setEditTarget(null) }}
          onDelete={async () => { await handleDelete(editTarget.id); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {showManageCategories && (
        <ManageCategoriesModal
          categories={categories}
          onAdd={handleAddCategory}
          onDelete={handleDeleteCategory}
          onClose={() => setShowManageCategories(false)}
        />
      )}

      <BottomNav />
    </div>
  )
}

// ── 料理カード ────────────────────────────────────────────

function DishCard({ dish, onReview, onEdit }) {
  const thumbnailUrl = getThumbnailUrl(dish)
  const platform = getPlatform(dish.url)
  const platformInfo = platform ? PLATFORM_LABELS[platform] : null
  const hasReview = !!dish.cooked_at

  return (
    <li className={styles.card}>
      {thumbnailUrl && (
        <div className={styles.thumbnailWrapper}>
          <img
            src={thumbnailUrl}
            alt={dish.name}
            className={styles.thumbnail}
            loading="lazy"
            onError={e => { e.currentTarget.parentElement.style.display = 'none' }}
          />
          {platformInfo && (
            <span className={styles.platformBadge}>
              {platformInfo.icon} {platformInfo.label}
            </span>
          )}
        </div>
      )}

      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          {dish.category && (
            <span className={styles.categoryBadge}>{dish.category.name}</span>
          )}
          {!thumbnailUrl && platformInfo && (
            <span className={styles.platformBadgeInline}>
              {platformInfo.icon} {platformInfo.label}
            </span>
          )}
          {hasReview && (
            <span className={styles.cookedBadge}>✅ 作った</span>
          )}
        </div>

        <p className={styles.dishName}>{dish.name}</p>

        {hasReview && dish.rating && (
          <p className={styles.ratingDisplay}>
            {'★'.repeat(dish.rating)}{'☆'.repeat(5 - dish.rating)}
          </p>
        )}
        {hasReview && dish.review && (
          <p className={styles.reviewText}>💬 {dish.review}</p>
        )}

        <div className={styles.cardBottom}>
          <div className={styles.cardActions}>
            {dish.url && (
              <a
                href={dish.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkBtn}
                onClick={e => e.stopPropagation()}
              >
                🔗 レシピを見る
              </a>
            )}
            {!hasReview && (
              <button className={styles.cookedBtn} onClick={onReview}>
                作った！
              </button>
            )}
          </div>
          <button
            className={styles.editBtn}
            onClick={onEdit}
            aria-label="編集"
          >✏️</button>
        </div>
      </div>
    </li>
  )
}

// ── 料理追加モーダル ──────────────────────────────────────

function AddDishModal({ categories, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [url, setUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [fetchingThumb, setFetchingThumb] = useState(false)
  const [thumbAutoFetched, setThumbAutoFetched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const debounceRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onSubmit({ name, categoryId, url, imageUrl })
    setSubmitting(false)
  }

  async function fetchThumbnail(rawUrl) {
    const trimmed = rawUrl.trim()
    if (!trimmed) {
      setImageUrl('')
      setThumbAutoFetched(false)
      return
    }

    // YouTubeはクライアント側で処理済みなのでスキップ
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      setThumbAutoFetched(false)
      return
    }

    setFetchingThumb(true)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-og-image', {
        body: { url: trimmed },
      })
      if (!error && data?.image) {
        setImageUrl(data.image)
        setThumbAutoFetched(true)
      }
    } catch {
      // 取得失敗はサイレントに無視
    } finally {
      setFetchingThumb(false)
    }
  }

  function handleUrlChange(e) {
    const val = e.target.value
    setUrl(val)
    // 手動で画像URLを編集していたらauto-fetchしない
    if (imageUrl && !thumbAutoFetched) return
    if (thumbAutoFetched && !val.trim()) {
      setImageUrl('')
      setThumbAutoFetched(false)
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchThumbnail(val), 800)
  }

  function handleImageUrlChange(e) {
    setImageUrl(e.target.value)
    setThumbAutoFetched(false)
  }

  const previewUrl = imageUrl || (() => {
    const ytId = extractYouTubeId(url)
    return ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null
  })()

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>おかずを追加</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            料理名
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: 鶏の唐揚げ、麻婆豆腐..."
              maxLength={100}
              autoFocus
              required
            />
          </label>
          <label className={styles.label}>
            カテゴリ（任意）
            <select
              className={styles.input}
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">カテゴリなし</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            参考URL（任意）
            <input
              className={styles.input}
              value={url}
              onChange={handleUrlChange}
              placeholder="https://... (YouTube Shorts / TikTok / Web記事)"
              type="url"
            />
          </label>
          <label className={styles.label}>
            画像URL（任意）
            <div className={styles.imageUrlRow}>
              <input
                className={styles.input}
                value={imageUrl}
                onChange={handleImageUrlChange}
                placeholder="https://... (サムネイル画像)"
                type="url"
              />
              {fetchingThumb && <span className={styles.thumbFetching}>取得中...</span>}
            </div>
            <span className={styles.inputHint}>
              {thumbAutoFetched ? '✓ サムネイルを自動取得しました' : 'URLを入力すると自動でサムネイルを取得します'}
            </span>
          </label>
          {previewUrl && (
            <div className={styles.thumbPreview}>
              <img
                src={previewUrl}
                alt="サムネイルプレビュー"
                className={styles.thumbPreviewImg}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}
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

// ── 作ったレビューモーダル ────────────────────────────────

function ReviewModal({ dish, onSubmit, onClose }) {
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await onSubmit({ rating, review })
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>「{dish.name}」を作った！</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
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
            感想（任意）
            <textarea
              className={styles.textarea}
              value={review}
              onChange={e => setReview(e.target.value)}
              placeholder="例: 家族に大好評！また作りたい..."
              maxLength={300}
              rows={3}
            />
          </label>
          <div className={styles.formBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting}>
              {submitting ? '記録中...' : '記録する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 料理編集モーダル ──────────────────────────────────────

function EditDishModal({ dish, categories, onSubmit, onDelete, onClose }) {
  const [name, setName] = useState(dish.name)
  const [categoryId, setCategoryId] = useState(dish.category_id || '')
  const [url, setUrl] = useState(dish.url || '')
  const [imageUrl, setImageUrl] = useState(dish.image_url || '')
  const [fetchingThumb, setFetchingThumb] = useState(false)
  const [thumbAutoFetched, setThumbAutoFetched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const debounceRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onSubmit({ name, categoryId, url, imageUrl })
    setSubmitting(false)
  }

  async function fetchThumbnail(rawUrl) {
    const trimmed = rawUrl.trim()
    if (!trimmed) { setImageUrl(''); setThumbAutoFetched(false); return }
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) { setThumbAutoFetched(false); return }
    setFetchingThumb(true)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-og-image', { body: { url: trimmed } })
      if (!error && data?.image) { setImageUrl(data.image); setThumbAutoFetched(true) }
    } catch (e) {
      console.error('[thumbnail] exception:', e)
    } finally {
      setFetchingThumb(false)
    }
  }

  function handleUrlChange(e) {
    const val = e.target.value
    setUrl(val)
    if (imageUrl && !thumbAutoFetched) return
    if (thumbAutoFetched && !val.trim()) { setImageUrl(''); setThumbAutoFetched(false) }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchThumbnail(val), 800)
  }

  const previewUrl = imageUrl || (() => {
    const ytId = extractYouTubeId(url)
    return ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null
  })()

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>おかずを編集</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            料理名
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: 鶏の唐揚げ、麻婆豆腐..."
              maxLength={100}
              autoFocus
              required
            />
          </label>
          <label className={styles.label}>
            カテゴリ（任意）
            <select
              className={styles.input}
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">カテゴリなし</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            参考URL（任意）
            <input
              className={styles.input}
              value={url}
              onChange={handleUrlChange}
              placeholder="https://... (YouTube Shorts / TikTok / Web記事)"
              type="url"
            />
          </label>
          <label className={styles.label}>
            画像URL（任意）
            <div className={styles.imageUrlRow}>
              <input
                className={styles.input}
                value={imageUrl}
                onChange={e => { setImageUrl(e.target.value); setThumbAutoFetched(false) }}
                placeholder="https://... (サムネイル画像)"
                type="url"
              />
              {fetchingThumb && <span className={styles.thumbFetching}>取得中...</span>}
            </div>
            <span className={styles.inputHint}>
              {thumbAutoFetched ? '✓ サムネイルを自動取得しました' : 'URLを入力すると自動でサムネイルを取得します'}
            </span>
          </label>
          {previewUrl && (
            <div className={styles.thumbPreview}>
              <img
                src={previewUrl}
                alt="サムネイルプレビュー"
                className={styles.thumbPreviewImg}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}
          <div className={styles.formBtns}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>

        <div className={styles.deleteSeparator} />
        {confirmDelete ? (
          <div className={styles.deleteConfirm}>
            <p className={styles.deleteConfirmText}>本当に削除しますか？</p>
            <div className={styles.formBtns}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>キャンセル</button>
              <button className={styles.deleteDangerBtn} onClick={onDelete}>削除する</button>
            </div>
          </div>
        ) : (
          <button className={styles.deleteOutlineBtn} onClick={() => setConfirmDelete(true)}>
            🗑️ このおかずを削除
          </button>
        )}
      </div>
    </div>
  )
}

// ── カテゴリ管理モーダル ──────────────────────────────────

function ManageCategoriesModal({ categories, onAdd, onDelete, onClose }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await onAdd(newName)
    setNewName('')
    setAdding(false)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>カテゴリを管理</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        {categories.length > 0 && (
          <ul className={styles.categoryList}>
            {categories.map(cat => (
              <li key={cat.id} className={styles.categoryItem}>
                <span className={styles.categoryItemName}>{cat.name}</span>
                <button
                  className={styles.categoryDeleteBtn}
                  onClick={() => onDelete(cat.id)}
                  aria-label={`${cat.name}を削除`}
                >×</button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className={styles.addCategoryForm}>
          <input
            className={styles.input}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="新しいカテゴリ名..."
            maxLength={30}
          />
          <button
            type="submit"
            className={styles.saveBtn}
            disabled={adding || !newName.trim()}
            style={{ flex: 'none', padding: '0.75rem 1.25rem' }}
          >
            追加
          </button>
        </form>

        <button className={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
