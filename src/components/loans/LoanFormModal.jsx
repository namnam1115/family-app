import { useState } from 'react'
import Modal from '../Modal'
import MemberPicker from './MemberPicker'
import { IconSwap } from '../../lib/icons'
import { formatYen, parseAmount, todayStr } from '../../lib/loans'
import styles from './Loans.module.css'

/**
 * 貸し借りの記録・編集フォーム。
 *
 * props:
 *   loan         : 編集対象（新規は null）
 *   members      : 家族メンバー [{ id, name, color }]
 *   myMemberId   : 自分の family_members.id（新規時の「貸した人」の初期値）
 *   repaid       : 編集時の返済済み合計（金額をこれより小さくできない）
 *   onSave       : (payload) => Promise。失敗時は例外を投げること
 *   onClose      : 閉じる
 */
export default function LoanFormModal({ loan, members, myMemberId, repaid = 0, onSave, onClose }) {
  const isEdit = !!loan
  const [lenderId, setLenderId] = useState(loan?.lender_id ?? myMemberId ?? '')
  const [borrowerId, setBorrowerId] = useState(
    loan?.borrower_id ?? members.find(m => m.id !== (loan?.lender_id ?? myMemberId))?.id ?? ''
  )
  const [amount, setAmount] = useState(loan ? String(loan.amount) : '')
  const [borrowedOn, setBorrowedOn] = useState(loan?.borrowed_on ?? todayStr())
  const [memo, setMemo] = useState(loan?.memo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function swap() {
    setLenderId(borrowerId)
    setBorrowerId(lenderId)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (!lenderId) { setError('貸した人を選んでください'); return }
    if (!borrowerId) { setError('借りた人を選んでください'); return }
    if (lenderId === borrowerId) { setError('貸した人と借りた人は別の人を選んでください'); return }
    if (value == null) { setError('金額は 1 円以上の数字で入力してください'); return }
    if (value < repaid) { setError(`返済済みの ${formatYen(repaid)} より少ない金額にはできません`); return }
    if (!borrowedOn) { setError('借りた日を選んでください'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({
        lender_id: lenderId,
        borrower_id: borrowerId,
        amount: value,
        borrowed_on: borrowedOn,
        memo: memo.trim() || null,
      })
    } catch (err) {
      console.error('貸し借りの保存エラー:', err)
      setError('保存に失敗しました。通信状況を確認してもう一度お試しください')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? '貸し借りを編集' : '貸し借りを記録'} variant="sheet">
      <form className={styles.body} onSubmit={handleSubmit}>
        <span className={styles.label}>貸した人 *</span>
        <MemberPicker members={members} value={lenderId} onChange={setLenderId} label="貸した人" />

        <button type="button" className={styles.swapBtn} onClick={swap} aria-label="貸した人と借りた人を入れ替える">
          <IconSwap aria-hidden="true" /> 入れ替え
        </button>

        <span className={styles.label}>借りた人 *</span>
        <MemberPicker members={members} value={borrowerId} onChange={setBorrowerId} label="借りた人" />

        <div className={styles.fieldRow}>
          <div>
            <label className={styles.label} htmlFor="loan-amount">金額（円） *</label>
            <input
              id="loan-amount"
              className={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="例：5000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus={!isEdit}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="loan-date">借りた日 *</label>
            <input
              id="loan-date"
              className={styles.input}
              type="date"
              value={borrowedOn}
              onChange={e => setBorrowedOn(e.target.value)}
            />
          </div>
        </div>

        <label className={styles.label} htmlFor="loan-memo">メモ（任意）</label>
        <input
          id="loan-memo"
          className={styles.input}
          type="text"
          placeholder="例：ランチ代の立て替え"
          value={memo}
          onChange={e => setMemo(e.target.value)}
          maxLength={200}
        />

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" className={styles.saveBtn} disabled={saving}>
          {saving ? '保存中…' : isEdit ? '更新する' : '記録する'}
        </button>
      </form>
    </Modal>
  )
}
