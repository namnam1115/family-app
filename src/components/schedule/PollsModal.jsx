import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { toDateStr } from '../../lib/schedule'
import Modal from '../Modal'
import styles from './Schedule.module.css'

const POLL_CHOICES = [
  { key: 'ok', emoji: '⭕', label: 'OK' },
  { key: 'maybe', emoji: '🤔', label: '未定' },
  { key: 'ng', emoji: '❌', label: 'NG' },
]

function pollDateLabel(cand) {
  const d = new Date(`${cand.candidate_date}T00:00:00`)
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  const base = `${d.getMonth() + 1}/${d.getDate()}(${wd})`
  return cand.candidate_time ? `${base} ${cand.candidate_time}` : `${base} 終日`
}

function PollList({ polls, onCreate, onOpen }) {
  return (
    <div className={styles.pollList}>
      <button className={styles.pollCreateBtn} onClick={onCreate}>＋ 新しい日程を調整する</button>
      {polls.length === 0 ? (
        <p className={styles.pollEmpty}>まだ調整中の予定はありません。<br />候補日を出して家族に聞いてみましょう。</p>
      ) : (
        polls.map(p => (
          <button key={p.id} className={styles.pollRow} onClick={() => onOpen(p.id)}>
            <span className={`${styles.pollBadge} ${p.status === 'open' ? styles.pollBadgeOpen : styles.pollBadgeClosed}`}>
              {p.status === 'open' ? '調整中' : '確定'}
            </span>
            <span className={styles.pollRowBody}>
              <span className={styles.pollRowTitle}>{p.title}</span>
              <span className={styles.pollRowMeta}>候補 {p.candidates?.length ?? 0}日{p.created_by_name ? ` ・ ${p.created_by_name}` : ''}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}

function PollCreate({ familyMember, onNotify, onDone }) {
  const today = toDateStr(new Date())
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [cands, setCands] = useState([{ date: today, time: '' }, { date: '', time: '' }])
  const [saving, setSaving] = useState(false)

  function update(i, key, val) {
    setCands(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c))
  }
  function addRow() { setCands(prev => [...prev, { date: '', time: '' }]) }
  function removeRow(i) { setCands(prev => prev.filter((_, idx) => idx !== i)) }

  const valid = title.trim() && cands.some(c => c.date)

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const { data: poll } = await supabase
      .from('schedule_polls')
      .insert({
        family_id: familyMember.family_id,
        title: title.trim(),
        memo: memo.trim() || null,
        created_by: familyMember.id,
        created_by_name: familyMember.name,
      })
      .select('id')
      .single()
    if (poll?.id) {
      const rows = cands
        .filter(c => c.date)
        .map((c, i) => ({
          poll_id: poll.id,
          family_id: familyMember.family_id,
          candidate_date: c.date,
          candidate_time: c.time || null,
          sort_order: i,
        }))
      if (rows.length) await supabase.from('schedule_poll_candidates').insert(rows)
      onNotify?.('poll_created', title.trim(), null)   // 家族へ通知
    }
    setSaving(false)
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.fieldLabel}>
        タイトル
        <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 家族で焼肉、祖父母と食事..." maxLength={100} autoFocus required />
      </label>
      <div className={styles.fieldLabel}>
        候補日（家族に聞きたい日を並べる）
        <div className={styles.pollCandEdit}>
          {cands.map((c, i) => (
            <div key={i} className={styles.pollCandRow}>
              <input className={styles.input} type="date" value={c.date} onChange={e => update(i, 'date', e.target.value)} />
              <input className={styles.input} type="time" value={c.time} onChange={e => update(i, 'time', e.target.value)} placeholder="時刻" />
              {cands.length > 1 && (
                <button type="button" className={styles.pollCandRemove} onClick={() => removeRow(i)} aria-label="この候補を削除">×</button>
              )}
            </div>
          ))}
          <button type="button" className={styles.pollAddCand} onClick={addRow}>＋ 候補日を追加</button>
        </div>
      </div>
      <label className={styles.fieldLabel}>メモ（任意）<input className={styles.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="場所・補足など..." maxLength={200} /></label>
      <div className={styles.formBtns}>
        <button type="submit" className={styles.saveBtn} disabled={saving || !valid}>{saving ? '作成中...' : '家族に聞く'}</button>
      </div>
    </form>
  )
}

function PollVote({ poll, familyMember, onRefetch, onNotify, onChanged, onClose }) {
  const [candidates, setCandidates] = useState([])
  const [votes, setVotes] = useState([])
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    const [{ data: cands }, { data: vs }] = await Promise.all([
      supabase.from('schedule_poll_candidates').select('*').eq('poll_id', poll.id).order('sort_order', { ascending: true }),
      supabase.from('schedule_poll_votes').select('*').eq('poll_id', poll.id),
    ])
    if (cands) setCandidates(cands)
    if (vs) setVotes(vs)
  }, [poll.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`poll_votes_${poll.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_poll_votes', filter: `poll_id=eq.${poll.id}` }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [poll.id, load])

  const myVote = candId => votes.find(v => v.candidate_id === candId && v.member_id === familyMember?.id)?.choice
  const tally = candId => {
    const t = { ok: 0, maybe: 0, ng: 0 }
    for (const v of votes) if (v.candidate_id === candId) t[v.choice] = (t[v.choice] || 0) + 1
    return t
  }
  const names = (candId, choice) => votes.filter(v => v.candidate_id === candId && v.choice === choice).map(v => v.member_name).filter(Boolean).join('、')

  // 最有力候補（OK最多→NG最少）
  const bestId = useMemo(() => {
    let best = null, bestScore = -Infinity
    for (const c of candidates) {
      const t = tally(c.id)
      const score = t.ok * 2 - t.ng
      if (t.ok > 0 && score > bestScore) { bestScore = score; best = c.id }
    }
    return best
  }, [candidates, votes])

  const open = poll.status === 'open'

  async function vote(candId, choice) {
    if (!familyMember) return
    const existing = votes.find(v => v.candidate_id === candId && v.member_id === familyMember.id)
    // この予定に対して自分がまだ一度も回答していないか（初回のみ家族へ通知）
    const firstResponse = !votes.some(v => v.member_id === familyMember.id)
    if (existing && existing.choice === choice) {
      setVotes(prev => prev.filter(v => v !== existing))
      await supabase.from('schedule_poll_votes').delete().eq('candidate_id', candId).eq('member_id', familyMember.id)
    } else {
      await supabase.from('schedule_poll_votes').upsert({
        poll_id: poll.id, candidate_id: candId, family_id: familyMember.family_id,
        member_id: familyMember.id, member_name: familyMember.name, choice,
      }, { onConflict: 'candidate_id,member_id' })
      if (firstResponse) onNotify?.('poll_voted', poll.title, null)   // 初回回答時のみ通知（連打での多重通知を防止）
    }
    await load()
  }

  async function confirm(cand) {
    setConfirming(true)
    const timed = !!cand.candidate_time
    let eventData
    if (timed) {
      const start = new Date(`${cand.candidate_date}T${cand.candidate_time}:00`)
      const end = new Date(start); end.setHours(end.getHours() + 1)
      eventData = {
        family_id: familyMember.family_id, title: poll.title, memo: poll.memo, all_day: false,
        member_id: null, shift_type: null, recurrence: 'none',
        start_date: null, end_date: null, start_datetime: start.toISOString(), end_datetime: end.toISOString(),
      }
    } else {
      eventData = {
        family_id: familyMember.family_id, title: poll.title, memo: poll.memo, all_day: true,
        member_id: null, shift_type: null, recurrence: 'none',
        start_date: cand.candidate_date, end_date: null, start_datetime: null, end_datetime: null,
      }
    }
    const { data: inserted } = await supabase.from('schedule_events').insert(eventData).select('id').single()
    if (inserted?.id) {
      await supabase.from('schedule_polls').update({ status: 'closed', confirmed_event_id: inserted.id }).eq('id', poll.id)
      onNotify?.('created', poll.title, inserted.id)
    }
    setConfirming(false)
    await onRefetch()
    await onChanged()
    onClose()
  }

  return (
    <div className={styles.pollVote}>
      {poll.memo && <p className={styles.pollMemo}>{poll.memo}</p>}
      {!open && <p className={styles.pollClosedNote}>この日程は確定済みです。</p>}

      <div className={styles.pollCands}>
        {candidates.map(c => {
          const t = tally(c.id)
          const isBest = open && c.id === bestId
          return (
            <div key={c.id} className={`${styles.pollCand} ${isBest ? styles.pollCandBest : ''}`}>
              <div className={styles.pollCandHead}>
                <span className={styles.pollCandDate}>{pollDateLabel(c)}{isBest && <span className={styles.pollBestTag}>最有力</span>}</span>
                <span className={styles.pollTally}>
                  {POLL_CHOICES.map(ch => (
                    <span key={ch.key} className={styles.pollTallyItem} title={names(c.id, ch.key)}>{ch.emoji}{t[ch.key]}</span>
                  ))}
                </span>
              </div>
              {open && (
                <div className={styles.pollChoiceRow}>
                  {POLL_CHOICES.map(ch => {
                    const mine = myVote(c.id) === ch.key
                    return (
                      <button
                        key={ch.key}
                        className={`${styles.pollChoiceBtn} ${mine ? styles.pollChoiceBtnMine : ''}`}
                        onClick={() => vote(c.id, ch.key)}
                        aria-pressed={mine}
                      >
                        <span className={styles.reactionBtnEmoji}>{ch.emoji}</span>{ch.label}
                      </button>
                    )
                  })}
                  <button className={styles.pollConfirmBtn} onClick={() => confirm(c)} disabled={confirming}>
                    この日で確定
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PollsModal({ familyMember, onRefetch, onNotify, onClose }) {
  const [polls, setPolls] = useState([])
  const [view, setView] = useState('list')       // 'list' | 'create'
  const [activePollId, setActivePollId] = useState(null)

  const loadPolls = useCallback(async () => {
    if (!familyMember?.family_id) return
    const { data } = await supabase
      .from('schedule_polls')
      .select('*, candidates:schedule_poll_candidates(id)')
      .eq('family_id', familyMember.family_id)
      .order('created_at', { ascending: false })
    if (data) setPolls(data)
  }, [familyMember?.family_id])

  useEffect(() => { loadPolls() }, [loadPolls])

  const activePoll = polls.find(p => p.id === activePollId) || null
  const inSub = view === 'create' || !!activePollId
  const heading = view === 'create' ? '新しい日程調整' : activePoll ? activePoll.title : '日程調整'

  return (
    <Modal
      open
      onClose={onClose}
      title={heading}
      headerStart={inSub && (
        <button className={styles.pollBack} onClick={() => { setView('list'); setActivePollId(null) }} aria-label="戻る">‹</button>
      )}
    >
      {view === 'create' ? (
        <PollCreate familyMember={familyMember} onNotify={onNotify} onDone={async () => { await loadPolls(); setView('list') }} />
      ) : activePoll ? (
        <PollVote
          poll={activePoll}
          familyMember={familyMember}
          onRefetch={onRefetch}
          onNotify={onNotify}
          onChanged={loadPolls}
          onClose={onClose}
        />
      ) : (
        <PollList polls={polls} onCreate={() => setView('create')} onOpen={setActivePollId} />
      )}
    </Modal>
  )
}
