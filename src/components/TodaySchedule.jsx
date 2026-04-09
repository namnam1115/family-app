import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './TodaySchedule.module.css'

const MEMBER_COLORS = [
  '#8E81B5', '#C2826A', '#5A9E82', '#C49A5A',
  '#6B9EC2', '#C26B8E', '#6BC2B4', '#9E6BC2',
]

const SHIFT_COLORS = {
  '日勤': '#3B82F6',
  '夜勤': '#7C3AED',
  '明け': '#F59E0B',
  '休み': '#10B981',
}

function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function TodaySchedule() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const today = toDateStr(new Date())
  const todayLabel = new Date().toLocaleDateString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  useEffect(() => {
    if (!familyMember?.family_id) return

    async function fetch() {
      const orFilter = [
        `and(all_day.eq.true,start_date.eq.${today},end_date.is.null)`,
        `and(all_day.eq.true,start_date.lte.${today},end_date.gte.${today})`,
        `and(all_day.eq.false,start_datetime.gte.${today}T00:00:00Z,start_datetime.lte.${today}T23:59:59Z)`,
      ].join(',')

      const [{ data: ev }, { data: mem }] = await Promise.all([
        supabase
          .from('schedule_events')
          .select('*, member:family_members!schedule_events_member_id_fkey(id, name)')
          .eq('family_id', familyMember.family_id)
          .or(orFilter)
          .order('start_datetime', { ascending: true, nullsFirst: false })
          .order('start_date', { ascending: true }),
        supabase
          .from('family_members')
          .select('id, name')
          .eq('family_id', familyMember.family_id),
      ])

      if (ev) setEvents(ev)
      if (mem) setMembers(mem)
      setLoading(false)
    }

    fetch()
  }, [familyMember?.family_id, today])

  if (!familyMember || loading) return null

  const memberColorMap = {}
  members.forEach((m, i) => { memberColorMap[m.id] = MEMBER_COLORS[i % MEMBER_COLORS.length] })

  const allDay = events.filter(e => e.all_day)
  const timed = events
    .filter(e => !e.all_day)
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))

  const isEmpty = allDay.length === 0 && timed.length === 0

  return (
    <section className={styles.section}>
      <div className={styles.titleRow}>
        <h2 className={styles.title}>今日の予定</h2>
        <span className={styles.dateLabel}>{todayLabel}</span>
        <button className={styles.linkBtn} onClick={() => navigate('/schedule')}>
          カレンダーを開く →
        </button>
      </div>

      {isEmpty ? (
        <p className={styles.empty}>本日の予定はありません</p>
      ) : (
        <div className={styles.eventList}>
          {/* 終日イベント */}
          {allDay.map(ev => {
            const color = ev.shift_type
              ? SHIFT_COLORS[ev.shift_type] ?? '#8E81B5'
              : ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'
            return (
              <div
                key={ev.id}
                className={styles.eventRow}
                style={{ '--ev-color': color }}
                onClick={() => navigate('/schedule')}
              >
                <span className={styles.timeSlot}>終日</span>
                <span className={styles.eventDot} />
                <span className={styles.eventTitle}>{ev.title}</span>
                {ev.member?.name && (
                  <span className={styles.memberTag} style={{ background: `${color}22`, color }}>
                    {ev.member.name}
                  </span>
                )}
              </div>
            )
          })}

          {/* 時間指定イベント */}
          {timed.map(ev => {
            const color = ev.member_id ? memberColorMap[ev.member_id] : '#8E81B5'
            return (
              <div
                key={ev.id}
                className={styles.eventRow}
                style={{ '--ev-color': color }}
                onClick={() => navigate('/schedule')}
              >
                <span className={styles.timeSlot}>{formatTime(ev.start_datetime)}</span>
                <span className={styles.eventDot} />
                <span className={styles.eventTitle}>{ev.title}</span>
                {ev.member?.name && (
                  <span className={styles.memberTag} style={{ background: `${color}22`, color }}>
                    {ev.member.name}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
