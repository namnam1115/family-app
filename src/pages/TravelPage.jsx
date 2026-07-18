import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import BottomNav from '../components/BottomNav'
import styles from './TravelPage.module.css'

const PREFECTURES = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県',
  '沖縄県',
]

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${y}年${m}月${day}日（${dow}）`
}

function dateRange(start, end) {
  if (start === end) return formatDate(start)
  return `${formatDate(start)}〜${formatDate(end)}`
}

export default function TravelPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()

  const [trips, setTrips] = useState([])
  const [activitiesMap, setActivitiesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [showTripModal, setShowTripModal] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [prefectureFilter, setPrefectureFilter] = useState('all')

  const fid = familyMember?.family_id

  const fetchTrips = useCallback(async () => {
    if (!fid) return
    const { data } = await supabase
      .from('travel_trips')
      .select('*')
      .eq('family_id', fid)
      .order('start_date', { ascending: false })
    setTrips(data ?? [])
    setLoading(false)

    if (data) {
      const activitiesData = await Promise.all(
        data.map(trip =>
          supabase
            .from('travel_activities')
            .select('*')
            .eq('trip_id', trip.id)
            .order('order_index')
        )
      )
      const map = {}
      data.forEach((trip, idx) => {
        map[trip.id] = activitiesData[idx].data ?? []
      })
      setActivitiesMap(map)
    }
  }, [fid])

  useEffect(() => {
    fetchTrips()
  }, [fetchTrips])

  useEffect(() => {
    if (!fid) return
    const channel = supabase
      .channel('travel_rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'travel_trips',
        filter: `family_id=eq.${fid}`,
      }, fetchTrips)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fid, fetchTrips])

  async function createTrip(payload) {
    const { data: trip, error: err } = await supabase
      .from('travel_trips')
      .insert(payload)
      .select()
      .single()

    if (err) throw err

    const { data: event, error: eventErr } = await supabase
      .from('schedule_events')
      .insert({
        family_id: fid,
        title: `✈ ${payload.title}`,
        all_day: true,
        start_date: payload.start_date,
        end_date: payload.end_date,
        memo: payload.memo || null,
      })
      .select()
      .single()

    if (eventErr) throw eventErr

    await supabase
      .from('travel_trips')
      .update({ schedule_event_id: event.id })
      .eq('id', trip.id)

    await fetchTrips()
  }

  async function updateTrip(tripId, payload) {
    const trip = trips.find(t => t.id === tripId)

    const { error: updateErr } = await supabase
      .from('travel_trips')
      .update(payload)
      .eq('id', tripId)

    if (updateErr) throw updateErr

    if (trip?.schedule_event_id) {
      await supabase
        .from('schedule_events')
        .update({
          title: `✈ ${payload.title}`,
          start_date: payload.start_date,
          end_date: payload.end_date,
          memo: payload.memo || null,
        })
        .eq('id', trip.schedule_event_id)
    }

    await fetchTrips()
  }

  async function deleteTrip(tripId) {
    const trip = trips.find(t => t.id === tripId)

    await supabase.from('travel_trips').delete().eq('id', tripId)

    if (trip?.schedule_event_id) {
      await supabase.from('schedule_events').delete().eq('id', trip.schedule_event_id)
    }

    setSelectedTrip(null)
    setDeleteConfirmId(null)
    await fetchTrips()
  }

  async function addActivity(tripId, title, memo) {
    const activities = activitiesMap[tripId] ?? []
    const orderIndex = Math.max(0, ...activities.map(a => a.order_index), -1) + 1

    const { error } = await supabase.from('travel_activities').insert({
      trip_id: tripId,
      family_id: fid,
      order_index: orderIndex,
      title,
      memo: memo || null,
    })

    if (error) throw error
    await fetchTrips()
  }

  async function deleteActivity(id) {
    await supabase.from('travel_activities').delete().eq('id', id)
    await fetchTrips()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
        <span className={styles.title}>✈️ 旅行記録</span>
        <button className={styles.addBtn} onClick={() => { setEditingTrip(null); setShowTripModal(true) }}>＋ 新しい旅行</button>
      </header>

      {trips.length > 0 && (
        <div className={styles.filterBar}>
          <select
            className={styles.prefectureFilter}
            value={prefectureFilter}
            onChange={e => setPrefectureFilter(e.target.value)}
          >
            <option value="all">すべての都道府県</option>
            {PREFECTURES.map(pref => (
              <option key={pref} value={pref}>{pref}</option>
            ))}
          </select>
        </div>
      )}

      <main className={styles.main}>
        {loading ? (
          <div className={styles.empty}>読み込み中…</div>
        ) : trips.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>✈️</span>
            <p>旅行記録がありません</p>
            <button className={styles.emptyAddBtn} onClick={() => { setEditingTrip(null); setShowTripModal(true) }}>
              最初の旅行を記録する
            </button>
          </div>
        ) : (() => {
          const filtered = prefectureFilter === 'all'
            ? trips
            : trips.filter(t => t.prefecture === prefectureFilter)
          return filtered.length === 0 ? (
            <div className={styles.empty}>
              <p>{prefectureFilter}の旅行記録がありません</p>
            </div>
          ) : (
            <div className={styles.tripList}>
              {filtered.map(trip => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  activityCount={activitiesMap[trip.id]?.length ?? 0}
                  onClick={() => setSelectedTrip(trip)}
                />
              ))}
            </div>
          )
        })()}
      </main>

      {selectedTrip && (
        <TripDetailModal
          trip={selectedTrip}
          activities={activitiesMap[selectedTrip.id] ?? []}
          onAddActivity={(title, memo) => addActivity(selectedTrip.id, title, memo)}
          onDeleteActivity={deleteActivity}
          onEdit={() => { setEditingTrip(selectedTrip); setShowTripModal(true) }}
          onDelete={() => setDeleteConfirmId(selectedTrip.id)}
          onClose={() => setSelectedTrip(null)}
        />
      )}

      {showTripModal && (
        <TripFormModal
          trip={editingTrip}
          onClose={() => setShowTripModal(false)}
          onSave={async (payload) => {
            if (editingTrip) {
              await updateTrip(editingTrip.id, payload)
            } else {
              await createTrip({ ...payload, family_id: fid, created_by: familyMember.name })
            }
            setShowTripModal(false)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="旅行を削除しますか？"
        message="この旅行と記録した活動がすべて削除されます。この操作は取り消せません。"
        confirmLabel="削除する"
        onConfirm={() => { const id = deleteConfirmId; setDeleteConfirmId(null); deleteTrip(id) }}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <BottomNav />
    </div>
  )
}

function TripCard({ trip, activityCount, onClick }) {
  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <div className={styles.cardDate}>{trip.start_date} - {trip.end_date}</div>
        {trip.prefecture && <span className={styles.prefBadge}>{trip.prefecture}</span>}
      </div>
      <div className={styles.cardTitle}>{trip.title}</div>
      <div className={styles.cardMeta}>{activityCount}件の活動 ▶</div>
    </div>
  )
}

function TripDetailModal({ trip, activities, onAddActivity, onDeleteActivity, onEdit, onDelete, onClose }) {
  const [newTitle, setNewTitle] = useState('')
  const [newMemo, setNewMemo] = useState('')
  const [error, setError] = useState('')

  async function handleAddActivity() {
    if (!newTitle.trim()) { setError('活動名を入力してください'); return }
    await onAddActivity(newTitle.trim(), newMemo.trim())
    setNewTitle('')
    setNewMemo('')
    setError('')
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{trip.title}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.tripInfo}>
            <div className={styles.dateRange}>{dateRange(trip.start_date, trip.end_date)}</div>
            {trip.prefecture && <div className={styles.tripPrefecture}>📍 {trip.prefecture}</div>}
            <div className={styles.scheduleStatus}>✈ スケジュールに自動登録済み</div>
          </div>

          <div className={styles.activitiesSection}>
            <h3 className={styles.sectionTitle}>活動記録</h3>
            <div className={styles.activityList}>
              {activities.map((activity, idx) => (
                <div key={activity.id} className={styles.activityItem}>
                  <div className={styles.activityNum}>{idx + 1}.</div>
                  <div className={styles.activityContent}>
                    <div className={styles.activityTitle}>{activity.title}</div>
                    {activity.memo && <div className={styles.activityMemo}>{activity.memo}</div>}
                  </div>
                  <button className={styles.deleteActivityBtn} onClick={() => onDeleteActivity(activity.id)}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.addActivitySection}>
            <input
              type="text"
              className={styles.activityInput}
              placeholder="活動名（例：中華街）"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <input
              type="text"
              className={styles.activityInput}
              placeholder="コメント（例：肉まん食べた）"
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.addActivityBtn} onClick={handleAddActivity}>＋ 活動を追加</button>
          </div>

          <div className={styles.actionBtns}>
            <button className={styles.editBtn} onClick={onEdit}>編集</button>
            <button className={styles.deleteBtn} onClick={onDelete}>削除</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TripFormModal({ trip, onClose, onSave }) {
  const isEdit = !!trip
  const [title, setTitle] = useState(trip?.title ?? '')
  const [startDate, setStartDate] = useState(trip?.start_date ?? '')
  const [endDate, setEndDate] = useState(trip?.end_date ?? '')
  const [prefecture, setPrefecture] = useState(trip?.prefecture ?? '')
  const [memo, setMemo] = useState(trip?.memo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!title.trim()) { setError('旅行名を入力してください'); return }
    if (!startDate) { setError('開始日を選択してください'); return }
    if (!endDate) { setError('終了日を選択してください'); return }
    if (new Date(endDate) < new Date(startDate)) { setError('終了日は開始日以降にしてください'); return }

    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        prefecture: prefecture || null,
        memo: memo.trim() || null,
      })
    } catch (err) {
      setError('保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{isEdit ? '旅行を編集' : '新しい旅行を追加'}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.label}>旅行名 *</label>
          <input
            type="text"
            className={styles.input}
            placeholder="例：横浜旅行"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />

          <label className={styles.label}>開始日 *</label>
          <input
            type="date"
            className={styles.input}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />

          <label className={styles.label}>終了日 *</label>
          <input
            type="date"
            className={styles.input}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />

          <label className={styles.label}>旅行先（任意）</label>
          <select
            className={styles.input}
            value={prefecture}
            onChange={e => setPrefecture(e.target.value)}
          >
            <option value="">都道府県を選択</option>
            {PREFECTURES.map(pref => (
              <option key={pref} value={pref}>{pref}</option>
            ))}
          </select>

          <label className={styles.label}>メモ（任意）</label>
          <textarea
            className={styles.textarea}
            placeholder="旅行の概要や特記事項"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows="3"
          />

          {error && <p className={styles.error}>{error}</p>}

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
