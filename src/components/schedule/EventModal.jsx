import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  MEMBER_COLORS,
  CATEGORIES,
  REMINDER_OPTIONS,
  ALLDAY_REMINDER_OPTIONS,
  RECURRENCE_OPTIONS,
  masterId,
  toDateStr,
  toLocalInput,
} from '../../lib/schedule'
import Modal from '../Modal'
import styles from './Schedule.module.css'

export default function EventModal({ mode, event, members, memberColorMap, familyId, defaultDate, defaultStartDt, defaultMemberId, onSubmit, onSubmitContinue, onDelete, onClose }) {
  const today = toDateStr(new Date())
  const nowRound = (() => {
    const d = new Date()
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0)
    return toLocalInput(d)
  })()

  const [title, setTitle] = useState(event?.title ?? '')
  const [memo, setMemo] = useState(event?.memo ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? (defaultStartDt ? false : true))
  const [startDate, setStartDate] = useState(event?.start_date ?? defaultDate ?? today)
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [startDt, setStartDt] = useState(
    event?.start_datetime
      ? toLocalInput(event.start_datetime)
      : defaultStartDt ?? nowRound
  )
  const [endDt, setEndDt] = useState(
    event?.end_datetime
      ? toLocalInput(event.end_datetime)
      : (() => {
          const base = new Date(defaultStartDt ?? nowRound)
          base.setHours(base.getHours() + 1)
          return toLocalInput(base)
        })()
  )
  const [memberId, setMemberId] = useState(event?.member_id ?? defaultMemberId ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [category, setCategory] = useState(event?.category ?? '')
  const [recurrence, setRecurrence] = useState(event?.recurrence ?? 'none')
  const [recurrenceUntil, setRecurrenceUntil] = useState(event?.recurrence_until ?? '')
  const [reminderMinutes, setReminderMinutes] = useState(
    event?.reminder_minutes != null ? String(event.reminder_minutes) : ''
  )
  const [submitting, setSubmitting] = useState(false)
  const [continueMode, setContinueMode] = useState(false)
  // 繰り返し予定の編集範囲（この回だけ / すべて）
  const [editScope, setEditScope] = useState('single')
  const titleRef = useRef(null)

  const [history, setHistory] = useState([])
  const histId = event ? masterId(event) : null
  useEffect(() => {
    if (mode !== 'edit' || !histId) return
    supabase
      .from('schedule_event_history')
      .select('id, action, changed_by_name, changed_at')
      .eq('event_id', histId)
      .order('changed_at', { ascending: false })
      .then(({ data }) => { if (data) setHistory(data) })
  }, [mode, histId])

  // タイトル履歴サジェスト（#7）: 家族の過去タイトルをよく使う順に
  const [titleSuggestions, setTitleSuggestions] = useState([])
  useEffect(() => {
    if (mode !== 'add' || !familyId) return
    supabase
      .from('schedule_events')
      .select('title')
      .eq('family_id', familyId)
      .is('shift_type', null)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!data) return
        const counts = {}
        for (const r of data) { if (r.title) counts[r.title] = (counts[r.title] || 0) + 1 }
        setTitleSuggestions(Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 20))
      })
  }, [mode, familyId])

  // 所要時間チップ（#7）: 終了を開始+分に設定
  function setDuration(min) {
    const base = new Date(startDt)
    if (isNaN(base)) return
    base.setMinutes(base.getMinutes() + min)
    setEndDt(toLocalInput(base))
  }

  function buildData() {
    return {
      title: title.trim(),
      memo: memo.trim() || null,
      all_day: allDay,
      member_id: memberId || null,
      shift_type: null,
      location: location.trim() || null,
      category: category || null,
      recurrence,
      recurrence_until: recurrence !== 'none' && recurrenceUntil ? recurrenceUntil : null,
      reminder_minutes: reminderMinutes ? Number(reminderMinutes) : null,
      ...(allDay
        ? { start_date: startDate, end_date: endDate || null, start_datetime: null, end_datetime: null }
        : { start_date: null, end_date: null, start_datetime: new Date(startDt).toISOString(), end_datetime: new Date(endDt).toISOString() }
      ),
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    const data = buildData()
    if (continueMode && !isEdit && onSubmitContinue) {
      // 続けて追加：モーダルを閉じずタイトルだけリセット
      await onSubmitContinue(data)
      setTitle(''); setMemo(''); setLocation('')
      setSubmitting(false)
      titleRef.current?.focus()
      return
    }
    // 「この回だけ変更」は単発予定として切り出すため繰り返しを解除
    if (isEdit && isOccurrence && editScope === 'single') {
      data.recurrence = 'none'; data.recurrence_until = null
    }
    await onSubmit(data, isOccurrence ? editScope : 'all')
    setSubmitting(false)
  }

  const isEdit = mode === 'edit'
  const isOccurrence = !!event?.is_occurrence

  return (
    <Modal open onClose={onClose} title={isEdit ? '予定を編集' : '予定を追加'}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {/* 繰り返し予定の編集範囲（#3） */}
        {isEdit && isOccurrence && (
          <div className={styles.fieldLabel}>
            変更範囲
            <div className={styles.toggleRow}>
              <button type="button" className={`${styles.toggleBtn} ${editScope === 'single' ? styles.toggleActive : ''}`} onClick={() => setEditScope('single')}>この回だけ</button>
              <button type="button" className={`${styles.toggleBtn} ${editScope === 'all' ? styles.toggleActive : ''}`} onClick={() => setEditScope('all')}>すべて</button>
            </div>
          </div>
        )}
        <label className={styles.fieldLabel}>
          タイトル
          <input ref={titleRef} list="schedule-title-suggestions" className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 家族でお出かけ、歯医者..." maxLength={100} autoFocus required />
          {titleSuggestions.length > 0 && (
            <datalist id="schedule-title-suggestions">
              {titleSuggestions.map(t => <option key={t} value={t} />)}
            </datalist>
          )}
        </label>
        <div className={styles.fieldLabel}>
          種類
          <div className={styles.toggleRow}>
            <button type="button" className={`${styles.toggleBtn} ${allDay ? styles.toggleActive : ''}`} onClick={() => setAllDay(true)}>終日</button>
            <button type="button" className={`${styles.toggleBtn} ${!allDay ? styles.toggleActive : ''}`} onClick={() => setAllDay(false)}>時間指定</button>
          </div>
        </div>
        {allDay ? (
          <>
            <label className={styles.fieldLabel}>開始日<input className={styles.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label>
            <label className={styles.fieldLabel}>終了日（任意・複数日の場合）<input className={styles.input} type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></label>
          </>
        ) : (
          <>
            <label className={styles.fieldLabel}>開始<input className={styles.input} type="datetime-local" value={startDt} onChange={e => {
              const v = e.target.value
              setStartDt(v)
              // 開始を動かしたら、終了が開始以前になった場合は開始+1時間へ自動追従
              if (v && endDt && endDt <= v) {
                const base = new Date(v); base.setHours(base.getHours() + 1)
                setEndDt(toLocalInput(base))
              }
            }} required /></label>
            <label className={styles.fieldLabel}>終了<input className={styles.input} type="datetime-local" value={endDt} min={startDt} onChange={e => setEndDt(e.target.value)} required /></label>
            <div className={styles.durationChips}>
              <span className={styles.durationLabel}>所要</span>
              <button type="button" className={styles.durationChip} onClick={() => setDuration(30)}>30分</button>
              <button type="button" className={styles.durationChip} onClick={() => setDuration(60)}>1時間</button>
              <button type="button" className={styles.durationChip} onClick={() => setDuration(120)}>2時間</button>
              <button type="button" className={styles.durationChip} onClick={() => setDuration(180)}>3時間</button>
            </div>
          </>
        )}
        {members.length > 0 && (
          <div className={styles.fieldLabel}>
            誰の予定？
            <div className={styles.memberSelect}>
              <button type="button" className={`${styles.memberOption} ${!memberId ? styles.memberOptionActive : ''}`} style={!memberId ? { '--active-color': 'var(--primary)' } : {}} onClick={() => setMemberId('')}>
                <span className={styles.memberDot} style={{ background: 'var(--gray-300)' }} />家族全員
              </button>
              {members.map((m, i) => {
                const color = MEMBER_COLORS[i % MEMBER_COLORS.length]
                return (
                  <button key={m.id} type="button" className={`${styles.memberOption} ${memberId === m.id ? styles.memberOptionActive : ''}`} style={memberId === m.id ? { '--active-color': color } : {}} onClick={() => setMemberId(m.id)}>
                    <span className={styles.memberDot} style={{ background: color }} />{m.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {/* カテゴリ（#10） */}
        <div className={styles.fieldLabel}>
          カテゴリ（任意）
          <div className={styles.categorySelect}>
            <button type="button" className={`${styles.categoryChip} ${!category ? styles.categoryChipActive : ''}`} onClick={() => setCategory('')}>
              なし
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                type="button"
                className={`${styles.categoryChip} ${category === c.key ? styles.categoryChipActive : ''}`}
                style={{ '--cat-color': c.color }}
                onClick={() => setCategory(c.key)}
              >
                <span className={styles.categoryDot} style={{ background: c.color }} />{c.key}
              </button>
            ))}
          </div>
        </div>

        {/* 繰り返し（#3） */}
        <label className={styles.fieldLabel}>
          繰り返し
          <select className={styles.input} value={recurrence} onChange={e => setRecurrence(e.target.value)}>
            {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {recurrence !== 'none' && (
          <label className={styles.fieldLabel}>
            繰り返し終了日（任意・空欄で無期限）
            <input className={styles.input} type="date" value={recurrenceUntil} min={allDay ? startDate : undefined} onChange={e => setRecurrenceUntil(e.target.value)} />
          </label>
        )}

        {/* リマインダー（#4・終日は当日朝基準） */}
        <label className={styles.fieldLabel}>
          リマインダー通知
          <select className={styles.input} value={reminderMinutes} onChange={e => setReminderMinutes(e.target.value)}>
            {(allDay ? ALLDAY_REMINDER_OPTIONS : REMINDER_OPTIONS).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {/* 場所（#9） */}
        <label className={styles.fieldLabel}>場所（任意）<input className={styles.input} value={location} onChange={e => setLocation(e.target.value)} placeholder="例: 〇〇病院、東京駅..." maxLength={120} /></label>
        <label className={styles.fieldLabel}>メモ（任意）<input className={styles.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="詳細など..." maxLength={200} /></label>
        {!isEdit && (
          <label className={styles.continueToggle}>
            <input type="checkbox" checked={continueMode} onChange={e => setContinueMode(e.target.checked)} />
            続けて追加する（保存後に入力欄をリセット）
          </label>
        )}
        <div className={styles.formBtns}>
          {isEdit && <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>}
          <button type="button" className={styles.cancelBtn} onClick={onClose}>{continueMode && !isEdit ? '完了' : 'キャンセル'}</button>
          <button type="submit" className={styles.saveBtn} disabled={submitting || !title.trim()}>{submitting ? '保存中...' : isEdit ? '保存' : continueMode ? '追加して次へ' : '追加'}</button>
        </div>
      </form>
      {isEdit && history.length > 0 && (
        <div className={styles.historySection}>
          <p className={styles.historySectionTitle}>変更履歴</p>
          <ul className={styles.historyList}>
            {history.map(h => (
              <li key={h.id} className={styles.historyItem}>
                <span className={`${styles.historyAction} ${h.action === 'created' ? styles.historyActionCreated : styles.historyActionUpdated}`}>
                  {h.action === 'created' ? '作成' : '更新'}
                </span>
                <span className={styles.historyDate}>
                  {new Date(h.changed_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {h.changed_by_name && (
                  <span className={styles.historyBy}>{h.changed_by_name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

// ── 表示ヘルパー ──────────────────────────────────────────────
