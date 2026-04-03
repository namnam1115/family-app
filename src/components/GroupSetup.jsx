import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import styles from './GroupSetup.module.css'

export default function GroupSetup() {
  const { user, createFamily } = useAuth()
  const [mode, setMode] = useState(null) // 'create' | null
  const [familyName, setFamilyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    if (!familyName.trim()) return
    setLoading(true)
    setError('')
    try {
      await createFamily(familyName.trim())
    } catch (err) {
      setError('グループの作成に失敗しました。')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>ようこそ！</h2>
        <p className={styles.subtitle}>
          {user?.user_metadata?.full_name || user?.email} さん、
          家族グループを作成するか、招待リンクから参加してください。
        </p>

        {!mode && (
          <div className={styles.options}>
            <button className={styles.primaryBtn} onClick={() => setMode('create')}>
              新しいグループを作成
            </button>
            <p className={styles.hint}>
              招待リンクをお持ちの場合は、そのリンクを開いてください。
            </p>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className={styles.form}>
            <label className={styles.label} htmlFor="familyName">
              グループ名
            </label>
            <input
              id="familyName"
              className={styles.input}
              type="text"
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              placeholder="例: 田中家"
              maxLength={50}
              required
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => { setMode(null); setError('') }}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={loading || !familyName.trim()}
              >
                {loading ? '作成中...' : 'グループを作成'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
