import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { eventColor, toDateStr, formatTime } from '../../lib/schedule'
import Modal from '../Modal'
import styles from './Schedule.module.css'

export default function SearchModal({ familyMember, memberColorMap, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (!term || !familyMember?.family_id) { setResults([]); setSearched(false); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      // PostgREST の or フィルタを壊す文字を除去
      const safe = term.replace(/[,()%*]/g, ' ').trim()
      if (!safe) { setResults([]); setLoading(false); return }
      const { data } = await supabase
        .from('schedule_events')
        .select('*, member:family_members!schedule_events_member_id_fkey(id, name)')
        .eq('family_id', familyMember.family_id)
        .is('shift_type', null)
        .or(`title.ilike.%${safe}%,memo.ilike.%${safe}%,location.ilike.%${safe}%`)
        .limit(80)
      // 実効日で並べ替え：今日以降を昇順→過去を降順
      const todayStr = toDateStr(new Date())
      const eff = e => e.all_day ? e.start_date : toDateStr(new Date(e.start_datetime))
      const rows = (data || []).map(e => ({ ...e, _eff: eff(e) }))
      const future = rows.filter(r => r._eff >= todayStr).sort((a, b) => a._eff < b._eff ? -1 : 1)
      const past = rows.filter(r => r._eff < todayStr).sort((a, b) => a._eff > b._eff ? -1 : 1)
      setResults([...future, ...past])
      setLoading(false)
      setSearched(true)
    }, 250)
    return () => clearTimeout(timer)
  }, [q, familyMember?.family_id])

  function dateLabel(ev) {
    const d = new Date(`${ev._eff}T00:00:00`)
    const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
    const base = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${wd})`
    return ev.all_day ? base : `${base} ${formatTime(ev.start_datetime)}`
  }

  return (
    <Modal open onClose={onClose} title="予定を検索">
      <input
        className={styles.input}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="タイトル・メモ・場所で検索..."
        autoFocus
      />
      <div className={styles.searchResults}>
        {loading && <p className={styles.searchHint}>検索中...</p>}
        {!loading && searched && results.length === 0 && (
          <p className={styles.searchHint}>「{q.trim()}」に一致する予定はありません</p>
        )}
        {!loading && !searched && (
          <p className={styles.searchHint}>キーワードを入力してください</p>
        )}
        {results.map(ev => {
          const past = ev._eff < toDateStr(new Date())
          return (
            <button
              key={ev.id}
              className={`${styles.searchRow} ${past ? styles.searchRowPast : ''}`}
              style={{ '--chip-color': eventColor(ev, memberColorMap) }}
              onClick={() => onSelect(ev)}
            >
              <span className={styles.searchBar} />
              <span className={styles.searchBody}>
                <span className={styles.searchTitle}>
                  {ev.recurrence && ev.recurrence !== 'none' && <span className={styles.recurBadge} aria-hidden="true">↻</span>}
                  {ev.title}
                </span>
                <span className={styles.searchMeta}>
                  {dateLabel(ev)}
                  {ev.location && ` ・ ${ev.location}`}
                  {ev.member?.name && ` ・ ${ev.member.name}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
