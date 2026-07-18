import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './GroupSetup.module.css'

// 招待リンク（例: https://.../join/<id>）や貼り付けた文字列から family_id を取り出す
function extractFamilyId(raw) {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(/join\/([^/?#\s]+)/)
  if (m) return m[1]
  // URL でなければ、そのまま ID とみなす
  return s
}

export default function GroupSetup() {
  const { user, createFamily } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState(null) // 'create' | 'join' | null
  const [familyName, setFamilyName] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleJoin(e) {
    e.preventDefault()
    const id = extractFamilyId(inviteLink)
    if (!id) { setError('招待リンクを入力してください。'); return }
    navigate(`/join/${id}`)
  }

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
            <button className={styles.cancelBtn} onClick={() => { setMode('join'); setError('') }}>
              招待リンクで参加
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className={styles.form}>
            <label className={styles.label} htmlFor="inviteLink">
              招待リンク
            </label>
            <input
              id="inviteLink"
              className={styles.input}
              type="text"
              value={inviteLink}
              onChange={e => setInviteLink(e.target.value)}
              placeholder="家族から届いた招待リンクを貼り付け"
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => { setMode(null); setError('') }}
              >
                戻る
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={!inviteLink.trim()}
              >
                参加する
              </button>
            </div>
          </form>
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
