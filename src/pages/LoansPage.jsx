import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { IconLoan } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { useFamilyData, unwrap } from '../hooks/useFamilyData'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorNotice from '../components/ErrorNotice'
import Toast from '../components/Toast'
import LoanCard from '../components/loans/LoanCard'
import LoanFormModal from '../components/loans/LoanFormModal'
import RepaymentFormModal from '../components/loans/RepaymentFormModal'
import { MEMBER_COLORS } from '../lib/schedule'
import { formatYen, loanStatus, netBalances } from '../lib/loans'
import styles from './LoansPage.module.css'

const FILTERS = [
  { value: 'open', label: '返済中' },
  { value: 'settled', label: '完済' },
  { value: 'all', label: 'すべて' },
]

// 退会などでメンバーが消えた記録（lender_id / borrower_id が NULL）の表示用
const UNKNOWN_MEMBER = { name: '退会したメンバー', color: 'var(--gray-400)' }

export default function LoansPage() {
  const navigate = useNavigate()
  const { familyMember } = useAuth()
  const [filter, setFilter] = useState('open')
  const [expandedId, setExpandedId] = useState(null)
  const [loanForm, setLoanForm] = useState(null) // { loan } — 新規は loan: null
  const [repayTarget, setRepayTarget] = useState(null) // loan
  const [confirm, setConfirm] = useState(null) // { type: 'loan' | 'repayment', target }
  const [toast, setToast] = useState(null)

  const {
    data: { loans, members },
    loading,
    error: loadError,
    refetch,
    familyId: fid,
    setData,
  } = useFamilyData(
    async familyId => {
      const [loans, members] = await Promise.all([
        unwrap(
          supabase.from('loans')
            .select('id, lender_id, borrower_id, amount, borrowed_on, memo, created_by, created_at, loan_repayments(id, amount, repaid_on, memo, created_at)')
            .eq('family_id', familyId)
            .order('borrowed_on', { ascending: false })
            .order('created_at', { ascending: false })
        ),
        unwrap(
          supabase.from('family_members').select('id, name').eq('family_id', familyId).order('joined_at')
        ),
      ])
      return { loans, members }
    },
    ['loans', 'loan_repayments', 'family_members'],
    { loans: [], members: [] },
  )

  const memberList = useMemo(
    () => members.map((m, i) => ({ id: m.id, name: m.name || 'メンバー', color: MEMBER_COLORS[i % MEMBER_COLORS.length] })),
    [members]
  )
  const memberById = useMemo(() => new Map(memberList.map(m => [m.id, m])), [memberList])
  const memberOf = id => memberById.get(id) ?? UNKNOWN_MEMBER

  const balances = useMemo(() => netBalances(loans), [loans])
  const counts = useMemo(() => {
    const settled = loans.filter(l => loanStatus(l).settled).length
    return { open: loans.length - settled, settled, all: loans.length }
  }, [loans])
  const visibleLoans = useMemo(() => loans.filter(loan => {
    if (filter === 'all') return true
    return loanStatus(loan).settled === (filter === 'settled')
  }), [loans, filter])

  function notifyFailure(message) {
    setToast({ message, variant: 'error' })
  }

  async function saveLoan(payload) {
    const editing = loanForm?.loan
    const { error } = editing
      ? await supabase.from('loans').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('loans').insert({ ...payload, family_id: fid, created_by: familyMember.name })
    if (error) throw error
    setLoanForm(null)
    await refetch()
  }

  async function saveRepayment(payload) {
    const loan = repayTarget
    const { error } = await supabase.from('loan_repayments').insert({
      ...payload,
      loan_id: loan.id,
      family_id: fid,
      created_by: familyMember.name,
    })
    if (error) throw error
    setRepayTarget(null)
    await refetch()
    if (payload.amount === loanStatus(loan).remaining) {
      setToast({ message: '完済しました。「完済」タブで確認できます。' })
    }
  }

  async function deleteLoan(loan) {
    const previous = loans
    setExpandedId(null)
    setData(prev => ({ ...prev, loans: prev.loans.filter(l => l.id !== loan.id) }))
    const { error } = await supabase.from('loans').delete().eq('id', loan.id)
    if (error) {
      console.error('貸し借りの削除エラー:', error)
      setData(prev => ({ ...prev, loans: previous }))
      notifyFailure('削除できませんでした。通信環境を確認してください。')
    }
  }

  async function deleteRepayment(repayment) {
    const previous = loans
    setData(prev => ({
      ...prev,
      loans: prev.loans.map(l => ({
        ...l,
        loan_repayments: (l.loan_repayments ?? []).filter(r => r.id !== repayment.id),
      })),
    }))
    const { error } = await supabase.from('loan_repayments').delete().eq('id', repayment.id)
    if (error) {
      console.error('返済の削除エラー:', error)
      setData(prev => ({ ...prev, loans: previous }))
      notifyFailure('返済の記録を削除できませんでした。通信環境を確認してください。')
    }
  }

  const canRecord = memberList.length >= 2
  const openNewLoan = () => setLoanForm({ loan: null })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
        <h1 className={styles.title}><IconLoan className={styles.titleIcon} /> 貸し借り</h1>
        {canRecord && <button className={styles.addBtn} onClick={openNewLoan}>＋ 記録</button>}
      </header>

      <main className={styles.main}>
        {loading ? (
          <LoadingSpinner inline />
        ) : loadError ? (
          <ErrorNotice onRetry={refetch} />
        ) : !canRecord ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><IconLoan /></span>
            <p>貸し借りを記録するには、家族メンバーが 2 人以上必要です。</p>
            <p className={styles.emptySub}>ホームの招待リンクから家族を招待してください。</p>
          </div>
        ) : loans.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><IconLoan /></span>
            <p>貸し借りの記録がありません</p>
            <button className={styles.emptyAddBtn} onClick={openNewLoan}>最初の貸し借りを記録する</button>
          </div>
        ) : (
          <div className={styles.content}>
            <section className={styles.balanceSection} aria-labelledby="loan-balance-title">
              <h2 id="loan-balance-title" className={styles.sectionTitle}>いまの貸し借り</h2>
              {balances.length === 0 ? (
                <p className={styles.balanceEmpty}>返済中の貸し借りはありません</p>
              ) : (
                <ul className={styles.balanceList}>
                  {balances.map(b => {
                    const borrower = memberOf(b.borrowerId)
                    const lender = memberOf(b.lenderId)
                    return (
                      <li key={`${b.lenderId}:${b.borrowerId}`} className={styles.balanceItem}>
                        <span className={styles.balancePeople}>
                          <span className={styles.dot} style={{ background: borrower.color }} />
                          <strong>{borrower.name}</strong>が
                          <span className={styles.dot} style={{ background: lender.color }} />
                          <strong>{lender.name}</strong>に借りている
                        </span>
                        <strong className={styles.balanceAmount}>{formatYen(b.amount)}</strong>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <div className={styles.filterTabs} role="tablist" aria-label="表示する貸し借り">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.value}
                  className={`${styles.filterTab} ${filter === f.value ? styles.filterTabActive : ''}`}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}<span className={styles.filterCount}>{counts[f.value]}</span>
                </button>
              ))}
            </div>

            {visibleLoans.length === 0 ? (
              <p className={styles.listEmpty}>
                {filter === 'settled' ? '完済した貸し借りはまだありません' : '返済中の貸し借りはありません'}
              </p>
            ) : (
              <div className={styles.loanList}>
                {visibleLoans.map(loan => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    lender={memberOf(loan.lender_id)}
                    borrower={memberOf(loan.borrower_id)}
                    expanded={expandedId === loan.id}
                    onToggle={() => setExpandedId(prev => (prev === loan.id ? null : loan.id))}
                    onRepay={() => setRepayTarget(loan)}
                    onEdit={() => setLoanForm({ loan })}
                    onDelete={() => setConfirm({ type: 'loan', target: loan })}
                    onDeleteRepayment={repayment => setConfirm({ type: 'repayment', target: repayment })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {loanForm && (
        <LoanFormModal
          loan={loanForm.loan}
          members={memberList}
          myMemberId={familyMember?.id}
          repaid={loanForm.loan ? loanStatus(loanForm.loan).repaid : 0}
          onSave={saveLoan}
          onClose={() => setLoanForm(null)}
        />
      )}

      {repayTarget && (
        <RepaymentFormModal
          title={`${memberOf(repayTarget.borrower_id).name} → ${memberOf(repayTarget.lender_id).name}`}
          remaining={loanStatus(repayTarget).remaining}
          onSave={saveRepayment}
          onClose={() => setRepayTarget(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.type === 'loan' ? '貸し借りを削除しますか？' : '返済の記録を削除しますか？'}
        message={confirm?.type === 'loan'
          ? `${formatYen(confirm.target.amount)} の貸し借りと、その返済の記録がすべて削除されます。この操作は取り消せません。`
          : confirm ? `${formatYen(confirm.target.amount)} の返済の記録を削除します。残額が元に戻ります。` : ''}
        confirmLabel="削除する"
        onConfirm={() => {
          const { type, target } = confirm
          setConfirm(null)
          if (type === 'loan') deleteLoan(target)
          else deleteRepayment(target)
        }}
        onCancel={() => setConfirm(null)}
      />

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      <BottomNav />
    </div>
  )
}
