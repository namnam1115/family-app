import { IconArrowRight, IconTrash } from '../../lib/icons'
import { formatDate, formatYen, loanStatus } from '../../lib/loans'
import styles from './Loans.module.css'

/**
 * 貸し借り 1 件のカード。タップで返済履歴と操作ボタンを開閉する。
 *
 * props:
 *   loan / lender / borrower : 貸し借りの行と、貸した人・借りた人（{ name, color }）
 *   expanded                 : 詳細を開いているか
 */
export default function LoanCard({
  loan, lender, borrower, expanded,
  onToggle, onRepay, onEdit, onDelete, onDeleteRepayment,
}) {
  const { repaid, remaining, settled, settledOn } = loanStatus(loan)
  const progress = Math.min(repaid / Number(loan.amount), 1)
  const repayments = [...(loan.loan_repayments ?? [])]
    .sort((a, b) => a.repaid_on.localeCompare(b.repaid_on) || a.created_at.localeCompare(b.created_at))
  const detailId = `loan-detail-${loan.id}`

  return (
    <article className={`${styles.card} ${settled ? styles.cardSettled : ''}`}>
      <button
        type="button"
        className={styles.cardMain}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        <div className={styles.cardPeople}>
          <MemberName member={lender} />
          <IconArrowRight className={styles.cardArrow} aria-hidden="true" />
          <span className={styles.srOnly}>が貸して</span>
          <MemberName member={borrower} />
          <span className={styles.srOnly}>が借りた</span>
        </div>
        <div className={styles.cardAmountRow}>
          <span className={styles.cardAmount}>{formatYen(loan.amount)}</span>
          {settled ? (
            <span className={styles.settledChip}>完済 {formatDate(settledOn)}</span>
          ) : (
            <span className={styles.remainingChip}>残り {formatYen(remaining)}</span>
          )}
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="返済の進み具合"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className={styles.cardMeta}>
          <span>{formatDate(loan.borrowed_on)} に借りた</span>
          {repaid > 0 && !settled && <span>返済済み {formatYen(repaid)}</span>}
        </div>
        {loan.memo && <p className={styles.cardMemo}>{loan.memo}</p>}
      </button>

      {expanded && (
        <div id={detailId} className={styles.detail}>
          <h3 className={styles.detailTitle}>返済の記録</h3>
          {repayments.length === 0 ? (
            <p className={styles.detailEmpty}>まだ返済されていません</p>
          ) : (
            <ul className={styles.repayList}>
              {repayments.map(r => (
                <li key={r.id} className={styles.repayItem}>
                  <span className={styles.repayDate}>{formatDate(r.repaid_on)}</span>
                  <span className={styles.repayAmount}>{formatYen(r.amount)}</span>
                  {r.memo && <span className={styles.repayMemo}>{r.memo}</span>}
                  <button
                    type="button"
                    className={styles.repayDeleteBtn}
                    onClick={() => onDeleteRepayment(r)}
                    aria-label={`${formatDate(r.repaid_on)} の返済 ${formatYen(r.amount)} を削除`}
                  >
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!settled && (
            <button type="button" className={styles.repayBtn} onClick={onRepay}>
              返済を記録
            </button>
          )}

          <div className={styles.actionBtns}>
            <button type="button" className={styles.editBtn} onClick={onEdit}>編集</button>
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>削除</button>
          </div>
          {loan.created_by && <p className={styles.createdBy}>記録: {loan.created_by}</p>}
        </div>
      )}
    </article>
  )
}

function MemberName({ member }) {
  return (
    <span className={styles.memberName}>
      <span className={styles.memberDot} style={{ background: member.color }} />
      {member.name}
    </span>
  )
}
