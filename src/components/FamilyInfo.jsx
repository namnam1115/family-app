import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './FamilyInfo.module.css'

export default function FamilyInfo() {
  const { familyMember } = useAuth()
  const [members, setMembers] = useState([])
  const [inviteCopied, setInviteCopied] = useState(false)

  useEffect(() => {
    if (!familyMember?.family_id) return

    async function fetchMembers() {
      const { data } = await supabase
        .from('family_members')
        .select('id, name, email, joined_at')
        .eq('family_id', familyMember.family_id)
        .order('joined_at')
      if (data) setMembers(data)
    }

    fetchMembers()
  }, [familyMember?.family_id])

  function copyInviteLink() {
    const url = `${window.location.origin}/join/${familyMember.family_id}`
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  if (!familyMember) return null

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div>
          <h2 className={styles.familyName}>{familyMember.families?.name}</h2>
          <p className={styles.memberCount}>メンバー {members.length}人</p>
        </div>
        <button className={styles.inviteBtn} onClick={copyInviteLink}>
          {inviteCopied ? '✓ コピーしました' : '招待リンクをコピー'}
        </button>
      </div>
      <div className={styles.memberList}>
        {members.map(m => (
          <div key={m.id} className={styles.member}>
            <div className={styles.avatar}>
              {(m.name || m.email || '?')[0].toUpperCase()}
            </div>
            <span className={styles.memberName}>{m.name || m.email}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
