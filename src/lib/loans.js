/** 家族間の貸し借り（LoansPage / components/loans）で使う計算・表示ヘルパー */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → '2026/9/27(日)'。年が今年なら省略する */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const year = y === new Date().getFullYear() ? '' : `${y}/`
  return `${year}${m}/${d}(${WEEKDAYS[date.getDay()]})`
}

export function formatYen(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `¥${Math.round(n).toLocaleString('ja-JP')}`
}

/**
 * 1 件の貸し借りの返済状況。
 * settledOn は完済になった返済日（最後の返済日）で、返済中なら null。
 */
export function loanStatus(loan) {
  const repayments = loan.loan_repayments ?? []
  const repaid = repayments.reduce((sum, r) => sum + Number(r.amount), 0)
  const remaining = Math.max(Number(loan.amount) - repaid, 0)
  const settled = remaining === 0
  const settledOn = settled
    ? repayments.reduce((latest, r) => (r.repaid_on > latest ? r.repaid_on : latest), '') || null
    : null
  return { repaid, remaining, settled, settledOn }
}

/**
 * 返済中の貸し借りを 2 人の組ごとに相殺した残高。
 * A→B に 1000 円、B→A に 300 円貸していれば「B が A に 700 円借りている」1 行になる。
 * 戻り値: [{ lenderId, borrowerId, amount }]（金額の大きい順）
 */
export function netBalances(loans) {
  const pairs = new Map()
  for (const loan of loans) {
    if (!loan.lender_id || !loan.borrower_id) continue
    const { remaining } = loanStatus(loan)
    if (remaining === 0) continue
    // 組のキーは ID の大小で正規化し、向きは符号で持つ
    const [a, b] = [loan.lender_id, loan.borrower_id].sort()
    const key = `${a}:${b}`
    const signed = loan.lender_id === a ? remaining : -remaining
    pairs.set(key, (pairs.get(key) ?? 0) + signed)
  }

  const result = []
  for (const [key, value] of pairs) {
    if (value === 0) continue
    const [a, b] = key.split(':')
    result.push(value > 0
      ? { lenderId: a, borrowerId: b, amount: value }
      : { lenderId: b, borrowerId: a, amount: -value })
  }
  return result.sort((x, y) => y.amount - x.amount)
}

/** 金額入力の文字列を正の整数に。カンマ・全角数字・「円」を許容し、不正なら null */
export function parseAmount(text) {
  const normalized = String(text ?? '').normalize('NFKC').replace(/[,¥円\s]/g, '')
  if (!/^\d+$/.test(normalized)) return null
  const n = Number(normalized)
  return n > 0 ? n : null
}
