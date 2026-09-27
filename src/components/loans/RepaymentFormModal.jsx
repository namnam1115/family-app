import { useState } from 'react'
import Modal from '../Modal'
import { formatYen, parseAmount, todayStr } from '../../lib/loans'
import styles from './Loans.module.css'

/**
 * 返済の記録フォーム。初期値は残額（全額返済）で、分割返済なら金額を書き換える。
 *
 * props:
 *   title     : 「花子 → 太郎」のような見出し
 *   remaining : 残額（これを超える返済は記録できない）
 *   onSave    : (payload) => Promise。失敗時は例外を投げること
 *   onClose   : 閉じる
 */
export default function RepaymentFormModal({ title, remaining, onSave, onClose }) {
  const [amount, setAmount] = useState(String(remaining))
  const [repaidOn, setRepaidOn] = useState(todayStr())
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const value = parseAmount(amount)
  const after = value == null ? null : remaining - value

  async function handleSubmit(e) {
    e.preventDefault()
    if (value == null) { setError('金額は 1 円以上の数字で入力してください'); return }
    if (value > remaining) { setError(`残額 ${formatYen(remaining)} を超えています`); return }
    if (!repaidOn) { setError('返した日を選んでください'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({ amount: value, repaid_on: repaidOn, memo: memo.trim() || null })
    } catch (err) {
      console.error('返済の保存エラー:', err)
      setError('保存に失敗しました。通信状況を確認してもう一度お試しください')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="返済を記録" variant="sheet">
      <form className={styles.body} onSubmit={handleSubmit}>
        <div className={styles.repaySummary}>
          <span className={styles.repaySummaryTitle}>{title}</span>
          <span>残り <strong>{formatYen(remaining)}</strong></span>
        </div>

        <div className={styles.fieldRow}>
          <div>
            <label className={styles.label} htmlFor="repay-amount">返した金額（円） *</label>
            <input
              id="repay-amount"
              className={styles.input}
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="repay-date">返した日 *</label>
            <input
              id="repay-date"
              className={styles.input}
              type="date"
              value={repaidOn}
              onChange={e => setRepaidOn(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.quickRow}>
          <button type="button" className={styles.quickBtn} onClick={() => setAmount(String(remaining))}>
            全額 {formatYen(remaining)}
          </button>
          {remaining >= 2 && (
            <button type="button" className={styles.quickBtn} onClick={() => setAmount(String(Math.floor(remaining / 2)))}>
              半分
            </button>
          )}
        </div>

        {after != null && after >= 0 && (
          <p className={styles.hint}>
            {after === 0 ? 'これで完済になります' : `返済後の残り ${formatYen(after)}`}
          </p>
        )}

        <label className={styles.label} htmlFor="repay-memo">メモ（任意）</label>
        <input
          id="repay-memo"
          className={styles.input}
          type="text"
          placeholder="例：現金で手渡し"
          value={memo}
          onChange={e => setMemo(e.target.value)}
          maxLength={200}
        />

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" className={styles.saveBtn} disabled={saving}>
          {saving ? '保存中…' : '返済を記録する'}
        </button>
      </form>
    </Modal>
  )
}
