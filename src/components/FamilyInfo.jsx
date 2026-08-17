import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconCheck } from '../lib/icons'
import MemberInfoModal from './MemberInfoModal'
import styles from './FamilyInfo.module.css'

export default function FamilyInfo() {
  const { familyMember } = useAuth()
  const [members, setMembers] = useState([])
  const [inviteCopied, setInviteCopied] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)

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
      <div className={styles.info}>
        <span className={styles.familyName}>{familyMember.families?.name}</span>
        <div className={styles.memberList}>
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              className={styles.avatar}
              title={m.name || m.email}
              onClick={() => setSelectedMember(m)}
            >
              {(m.name || m.email || '?')[0].toUpperCase()}
            </button>
          ))}
          <span className={styles.memberCount}>{members.length}名</span>
        </div>
      </div>
      <button className={styles.inviteBtn} onClick={copyInviteLink}>
        {inviteCopied ? <><IconCheck /> コピー</> : '招待'}
      </button>
      <MemberInfoModal
        member={selectedMember}
        isSelf={selectedMember?.id === familyMember.id}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  )
}
