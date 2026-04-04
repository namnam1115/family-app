import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from '../lib/pushNotifications'
import styles from './NotificationSettings.module.css'

export default function NotificationSettings({ familyMember, onClose }) {
  const [pushStatus, setPushStatus] = useState({ supported: false, permission: 'default', subscribed: false })
  const [settings, setSettings] = useState({ notification_enabled: false, notification_hour: 8 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  useEffect(() => {
    async function load() {
      const [status, { data }] = await Promise.all([
        getPushStatus(),
        supabase.from('family_settings').select('*').eq('family_id', familyMember.family_id).maybeSingle(),
      ])
      setPushStatus(status)
      if (data) setSettings({ notification_enabled: data.notification_enabled, notification_hour: data.notification_hour })
      setLoading(false)
    }
    load()
  }, [familyMember.family_id])

  async function handleTogglePush() {
    setToggling(true)
    setMessage({ text: '', type: '' })
    try {
      if (pushStatus.subscribed) {
        await unsubscribeFromPush(familyMember.user_id)
        setPushStatus(prev => ({ ...prev, subscribed: false }))
        setMessage({ text: 'このデバイスの通知を解除しました', type: 'info' })
      } else {
        await subscribeToPush(familyMember.family_id, familyMember.user_id)
        setPushStatus(prev => ({ ...prev, subscribed: true, permission: 'granted' }))
        setMessage({ text: 'このデバイスで通知を受け取れるようになりました', type: 'success' })
      }
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    }
    setToggling(false)
  }

  async function handleSave() {
    setSaving(true)
    setMessage({ text: '', type: '' })
    const { error } = await supabase.from('family_settings').upsert(
      { family_id: familyMember.family_id, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'family_id' }
    )
    if (error) setMessage({ text: '設定の保存に失敗しました', type: 'error' })
    else setMessage({ text: '設定を保存しました', type: 'success' })
    setSaving(false)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.title}>🔔 通知設定</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        {loading ? (
          <p className={styles.loading}>読み込み中...</p>
        ) : (
          <div className={styles.body}>

            {/* このデバイスの通知 */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>このデバイスの通知</h3>
              {!pushStatus.supported ? (
                <p className={styles.note}>このブラウザはプッシュ通知に対応していません</p>
              ) : pushStatus.permission === 'denied' ? (
                <p className={styles.noteWarn}>
                  通知がブロックされています。<br />ブラウザ設定 → サイトの設定 → 通知 から許可してください。
                </p>
              ) : (
                <div className={styles.pushRow}>
                  <div className={styles.pushInfo}>
                    <span className={`${styles.pushBadge} ${pushStatus.subscribed ? styles.badgeOn : styles.badgeOff}`}>
                      {pushStatus.subscribed ? '受信中' : '未設定'}
                    </span>
                    <span className={styles.pushDesc}>
                      {pushStatus.subscribed
                        ? 'アプリを閉じていても通知が届きます'
                        : '通知を有効にするとリマインダーが届きます'}
                    </span>
                  </div>
                  <button
                    className={`${styles.toggleBtn} ${pushStatus.subscribed ? styles.toggleOn : styles.toggleOff}`}
                    onClick={handleTogglePush}
                    disabled={toggling}
                  >
                    {toggling ? '...' : pushStatus.subscribed ? '解除' : '有効にする'}
                  </button>
                </div>
              )}
            </section>

            {/* 自動通知スケジュール */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>自動通知スケジュール（家族共通）</h3>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={settings.notification_enabled}
                  onChange={e => setSettings(prev => ({ ...prev, notification_enabled: e.target.checked }))}
                />
                <span>毎日自動通知を有効にする</span>
              </label>

              <div className={`${styles.timeRow} ${!settings.notification_enabled ? styles.dimmed : ''}`}>
                <label className={styles.timeLabel} htmlFor="notify-hour">通知時刻</label>
                <select
                  id="notify-hour"
                  className={styles.select}
                  value={settings.notification_hour}
                  onChange={e => setSettings(prev => ({ ...prev, notification_hour: Number(e.target.value) }))}
                  disabled={!settings.notification_enabled}
                >
                  {hours.map(h => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>

              <p className={styles.hint}>
                ⭐ マークの未購入アイテムがある場合のみ通知します
              </p>
            </section>

            {message.text && (
              <p className={`${styles.msg} ${styles[message.type]}`}>{message.text}</p>
            )}

            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '設定を保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
