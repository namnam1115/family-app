import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  SHIFT_COLORS,
  CATEGORY_COLORS,
  RECURRENCE_LABELS,
  REACTIONS,
  REACTION_LABELS,
  eventColor,
  masterId,
  toDateStr,
  eventTimeLabel,
  mapsUrl,
  reminderLabel,
} from '../../lib/schedule'
import Modal from '../Modal'
import styles from './Schedule.module.css'

function EventReactions({ eventId, familyMember }) {
  const [reactions, setReactions] = useState([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('schedule_event_reactions')
      .select('id, emoji, member_id, member_name')
      .eq('event_id', eventId)
    if (data) setReactions(data)
  }, [eventId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`schedule_reactions_${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_event_reactions',
        filter: `event_id=eq.${eventId}`,
      }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [eventId, load])

  // 絵文字ごとに集計（誰が押したか・自分が押したか）
  const summary = useMemo(() => {
    const map = {}
    for (const r of reactions) {
      const m = map[r.emoji] || { emoji: r.emoji, count: 0, names: [], mine: null }
      m.count += 1
      if (r.member_name) m.names.push(r.member_name)
      if (r.member_id === familyMember?.id) m.mine = r.id
      map[r.emoji] = m
    }
    return REACTIONS.map(o => map[o.emoji]).filter(Boolean)
  }, [reactions, familyMember?.id])

  async function toggle(emoji) {
    if (!familyMember) return
    const existing = reactions.find(r => r.emoji === emoji && r.member_id === familyMember.id)
    // 楽観的更新
    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id))
      await supabase.from('schedule_event_reactions').delete().eq('id', existing.id)
    } else {
      const optimistic = { id: `tmp-${emoji}`, emoji, member_id: familyMember.id, member_name: familyMember.name }
      setReactions(prev => [...prev, optimistic])
      await supabase.from('schedule_event_reactions').insert({
        event_id: eventId, family_id: familyMember.family_id,
        member_id: familyMember.id, member_name: familyMember.name, emoji,
      })
    }
    await load()
  }

  return (
    <div className={styles.reactionsSection}>
      {/* 押されている反応（件数・誰が） */}
      {summary.length > 0 && (
        <div className={styles.reactionSummary}>
          {summary.map(s => (
            <button
              key={s.emoji}
              className={`${styles.reactionCount} ${s.mine ? styles.reactionCountMine : ''}`}
              onClick={() => toggle(s.emoji)}
              title={`${REACTION_LABELS[s.emoji] ?? ''}：${s.names.join('、')}`}
            >
              <span className={styles.reactionEmoji}>{s.emoji}</span>
              <span className={styles.reactionCountLabel}>{REACTION_LABELS[s.emoji]}</span>
              <span className={styles.reactionNum}>{s.count}</span>
            </button>
          ))}
        </div>
      )}
      {/* 反応を追加するパレット */}
      <div className={styles.reactionPalette}>
        {REACTIONS.map(({ emoji, label }) => {
          const mine = reactions.some(r => r.emoji === emoji && r.member_id === familyMember?.id)
          return (
            <button
              key={emoji}
              className={`${styles.reactionBtn} ${mine ? styles.reactionBtnMine : ''}`}
              onClick={() => toggle(emoji)}
              aria-label={`${label} で反応`}
              aria-pressed={mine}
            >
              <span className={styles.reactionBtnEmoji}>{emoji}</span>
              <span className={styles.reactionBtnLabel}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 予定コメント（家族間コミュニケーション #5） ──────────────

function EventComments({ eventId, familyMember, eventTitle, onCommented }) {
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('schedule_event_comments')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }, [eventId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`schedule_comments_${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_event_comments',
        filter: `event_id=eq.${eventId}`,
      }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [eventId, load])

  async function send(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text || !familyMember) return
    setSending(true)
    setBody('')
    const { error } = await supabase.from('schedule_event_comments').insert({
      event_id: eventId,
      family_id: familyMember.family_id,
      member_id: familyMember.id,
      member_name: familyMember.name,
      body: text,
    })
    if (error) setBody(text)
    else { await load(); onCommented?.(eventTitle) }   // 家族へ即時通知（#1）
    setSending(false)
  }

  async function remove(id) {
    await supabase.from('schedule_event_comments').delete().eq('id', id)
    await load()
  }

  return (
    <div className={styles.commentsSection}>
      <p className={styles.commentsTitle}>コメント</p>
      <ul className={styles.commentList}>
        {comments.length === 0 && <li className={styles.commentEmpty}>まだコメントはありません</li>}
        {comments.map(c => (
          <li key={c.id} className={styles.commentItem}>
            <div className={styles.commentHead}>
              <span className={styles.commentAuthor}>{c.member_name || '家族'}</span>
              <span className={styles.commentDate}>
                {new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              {c.member_id === familyMember?.id && (
                <button className={styles.commentDelete} onClick={() => remove(c.id)} aria-label="コメントを削除">×</button>
              )}
            </div>
            <p className={styles.commentBody}>{c.body}</p>
          </li>
        ))}
      </ul>
      <form className={styles.commentForm} onSubmit={send}>
        <input
          className={styles.commentInput}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="コメントを入力..."
          maxLength={500}
        />
        <button className={styles.commentSend} type="submit" disabled={sending || !body.trim()}>送信</button>
      </form>
    </div>
  )
}

// ── 年月ジャンプ（#8） ────────────────────────────────────────

// ── 予定の検索 ────────────────────────────────────────────────

export default function EventDetailModal({ event, familyMember, memberColorMap, onNotifyComment, onEdit, onDelete, onDeleteOccurrence, onClose }) {
  const color = event.shift_type ? (SHIFT_COLORS[event.shift_type] ?? '#8E81B5') : eventColor(event, memberColorMap)
  const eid = masterId(event)
  const isRecurring = event.recurrence && event.recurrence !== 'none'

  const dateLabel = (() => {
    const base = event.all_day ? event.start_date : toDateStr(new Date(event.start_datetime))
    const d = new Date(`${base}T00:00:00`)
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  })()

  return (
    <Modal open onClose={onClose} title="予定の詳細">
      <div className={styles.detailBody}>
        <div className={styles.detailTitleRow}>
          <span className={styles.detailColorBar} style={{ background: color }} />
          <h3 className={styles.detailTitle}>{event.title}</h3>
        </div>

        <dl className={styles.detailList}>
          <div className={styles.detailItem}>
            <dt className={styles.detailLabel}>日時</dt>
            <dd className={styles.detailValue}>{dateLabel}<br />{eventTimeLabel(event)}</dd>
          </div>
          {event.recurrence && event.recurrence !== 'none' && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>繰り返し</dt>
              <dd className={styles.detailValue}>
                {RECURRENCE_LABELS[event.recurrence]}
                {event.recurrence_until && `（${event.recurrence_until}まで）`}
              </dd>
            </div>
          )}
          {event.category && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>カテゴリ</dt>
              <dd className={styles.detailValue}>
                <span className={styles.detailChip} style={{ '--cat-color': CATEGORY_COLORS[event.category] ?? '#8E81B5' }}>
                  <span className={styles.categoryDot} style={{ background: CATEGORY_COLORS[event.category] ?? '#8E81B5' }} />{event.category}
                </span>
              </dd>
            </div>
          )}
          {event.member?.name && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>担当</dt>
              <dd className={styles.detailValue}>{event.member.name}</dd>
            </div>
          )}
          {event.reminder_minutes != null && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>通知</dt>
              <dd className={styles.detailValue}>{reminderLabel(event.reminder_minutes, event.all_day)}</dd>
            </div>
          )}
          {event.location && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>場所</dt>
              <dd className={styles.detailValue}>
                {event.location}
                <a className={styles.mapLink} href={mapsUrl(event.location)} target="_blank" rel="noopener noreferrer">地図で開く</a>
              </dd>
            </div>
          )}
          {event.memo && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>メモ</dt>
              <dd className={styles.detailValue}>{event.memo}</dd>
            </div>
          )}
        </dl>

        <EventReactions eventId={eid} familyMember={familyMember} />

        <EventComments eventId={eid} familyMember={familyMember} eventTitle={event.title} onCommented={onNotifyComment} />
      </div>

      {/* 繰り返し予定は「この回だけ削除」を用意（#3） */}
      {isRecurring && (
        <div className={styles.recurDeleteRow}>
          <button type="button" className={styles.recurDeleteBtn} onClick={onDeleteOccurrence}>この回だけ削除</button>
          <span className={styles.recurDeleteHint}>繰り返し予定（{RECURRENCE_LABELS[event.recurrence]}）</span>
        </div>
      )}

      <div className={styles.formBtns}>
        <button type="button" className={styles.deleteBtn} onClick={onDelete}>{isRecurring ? 'すべて削除' : '削除'}</button>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>閉じる</button>
        <button type="button" className={styles.saveBtn} onClick={onEdit}>編集</button>
      </div>
    </Modal>
  )
}

// ── 予定へのアイコン反応（スタンプ） ─────────────────────────
