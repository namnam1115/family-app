import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconCheck } from '../lib/icons'
import MemberInfoModal from './MemberInfoModal'
import styles from './FamilyInfo.module.css'

export default function FamilyInfo() {
  const { familyMember, createInviteToken } = useAuth()
  const [members, setMembers] = useState([])
  const [inviteState, setInviteState] = useState('idle') // idle | loading | copied | error
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

  async function copyInviteLink() {
    setInviteState('loading')
    try {
      // 招待リンクは家族 ID ではなく使い捨てのトークンで発行する（有効期限 7 日）
      const token = await createInviteToken()
      await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`)
      setInviteState('copied')
      setTimeout(() => setInviteState('idle'), 2000)
    } catch (err) {
      console.error('招待リンク発行エラー:', err)
      setInviteState('error')
      setTimeout(() => setInviteState('idle'), 3000)
    }
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
      <button
        className={styles.inviteBtn}
        onClick={copyInviteLink}
        disabled={inviteState === 'loading'}
      >
        {inviteState === 'copied' ? <><IconCheck /> コピー</>
          : inviteState === 'loading' ? '発行中...'
          : inviteState === 'error' ? '失敗'
          : '招待'}
      </button>
      <MemberInfoModal
        member={selectedMember}
        isSelf={selectedMember?.id === familyMember.id}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  )
}
