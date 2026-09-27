import styles from './Loans.module.css'

/** 家族メンバーから 1 人を選ぶチップ（予定表と同じメンバー色） */
export default function MemberPicker({ members, value, onChange, label }) {
  return (
    <div className={styles.memberSelect} role="group" aria-label={label}>
      {members.map(member => {
        const active = member.id === value
        return (
          <button
            key={member.id}
            type="button"
            aria-pressed={active}
            className={`${styles.memberOption} ${active ? styles.memberOptionActive : ''}`}
            style={active ? { '--active-color': member.color } : undefined}
            onClick={() => onChange(member.id)}
          >
            <span className={styles.memberDot} style={{ background: member.color }} />
            {member.name}
          </button>
        )
      })}
    </div>
  )
}
