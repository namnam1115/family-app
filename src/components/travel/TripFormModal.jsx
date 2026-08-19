import { useState } from 'react'
import Modal from '../Modal'
import { PREFECTURES } from '../../lib/travel'
import styles from './Travel.module.css'

/**
 * 旅行の作成・編集フォーム。日程だけでなく、計画に必要な要素
 * （行き先・同行者・交通・宿・予算）をまとめて持たせる。
 *
 * props:
 *   trip    : 編集対象（新規は null）
 *   onSave  : (payload) => Promise。失敗時は例外を投げること
 *   onClose : 閉じる
 */
export default function TripFormModal({ trip, onSave, onClose }) {
  const isEdit = !!trip
  const [form, setForm] = useState({
    title: trip?.title ?? '',
    start_date: trip?.start_date ?? '',
    end_date: trip?.end_date ?? '',
    prefecture: trip?.prefecture ?? '',
    companions: trip?.companions ?? '',
    transport: trip?.transport ?? '',
    lodging: trip?.lodging ?? '',
    budget: trip?.budget != null ? String(trip.budget) : '',
    memo: trip?.memo ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('旅行名を入力してください'); return }
    if (!form.start_date) { setError('開始日を選択してください'); return }
    if (!form.end_date) { setError('終了日を選択してください'); return }
    if (form.end_date < form.start_date) { setError('終了日は開始日以降にしてください'); return }
    if (form.budget && !Number.isFinite(Number(form.budget))) { setError('予算は数値で入力してください'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({
        title: form.title.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        prefecture: form.prefecture || null,
        companions: form.companions.trim() || null,
        transport: form.transport.trim() || null,
        lodging: form.lodging.trim() || null,
        budget: form.budget === '' ? null : Number(form.budget),
        memo: form.memo.trim() || null,
      })
    } catch (err) {
      console.error('旅行の保存エラー:', err)
      setError('保存に失敗しました。通信状況を確認してもう一度お試しください')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? '旅行を編集' : '新しい旅行'} variant="sheet">
      <div className={styles.body}>
        <label className={styles.label} htmlFor="trip-title">旅行名 *</label>
        <input
          id="trip-title"
          type="text"
          className={styles.input}
          placeholder="例：横浜旅行"
          value={form.title}
          onChange={e => update('title', e.target.value)}
          autoFocus
        />

        <div className={styles.fieldRow}>
          <div>
            <label className={styles.label} htmlFor="trip-start">開始日 *</label>
            <input
              id="trip-start"
              type="date"
              className={styles.input}
              value={form.start_date}
              onChange={e => update('start_date', e.target.value)}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="trip-end">終了日 *</label>
            <input
              id="trip-end"
              type="date"
              className={styles.input}
              value={form.end_date}
              onChange={e => update('end_date', e.target.value)}
            />
          </div>
        </div>

        <label className={styles.label} htmlFor="trip-pref">旅行先（任意）</label>
        <select
          id="trip-pref"
          className={styles.select}
          value={form.prefecture}
          onChange={e => update('prefecture', e.target.value)}
        >
          <option value="">都道府県を選択</option>
          {PREFECTURES.map(pref => <option key={pref} value={pref}>{pref}</option>)}
        </select>

        <label className={styles.label} htmlFor="trip-companions">同行者（任意）</label>
        <input
          id="trip-companions"
          type="text"
          className={styles.input}
          placeholder="例：家族4人 + 祖母"
          value={form.companions}
          onChange={e => update('companions', e.target.value)}
        />

        <label className={styles.label} htmlFor="trip-transport">交通手段（任意）</label>
        <input
          id="trip-transport"
          type="text"
          className={styles.input}
          placeholder="例：新幹線 のぞみ 8:12 東京発"
          value={form.transport}
          onChange={e => update('transport', e.target.value)}
        />

        <label className={styles.label} htmlFor="trip-lodging">宿泊先（任意）</label>
        <input
          id="trip-lodging"
          type="text"
          className={styles.input}
          placeholder="例：〇〇ホテル（15時チェックイン）"
          value={form.lodging}
          onChange={e => update('lodging', e.target.value)}
        />

        <label className={styles.label} htmlFor="trip-budget">予算（任意・円）</label>
        <input
          id="trip-budget"
          type="number"
          inputMode="numeric"
          min="0"
          step="1000"
          className={styles.input}
          placeholder="例：80000"
          value={form.budget}
          onChange={e => update('budget', e.target.value)}
        />

        <label className={styles.label} htmlFor="trip-memo">メモ（任意）</label>
        <textarea
          id="trip-memo"
          className={styles.textarea}
          placeholder="旅行の概要や特記事項"
          rows="3"
          value={form.memo}
          onChange={e => update('memo', e.target.value)}
        />

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
        </button>
      </div>
    </Modal>
  )
}
