import { useRef, useState } from 'react'
import { IconCamera } from '../../lib/icons'
import { supabase } from '../../lib/supabase'
import styles from './Price.module.css'

// 値札の文字が読める程度に縮小して、通信量と読み取り時間を抑える
const MAX_SIDE = 1600
const JPEG_QUALITY = 0.85

async function resizeToJpegBase64(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]
}

/**
 * 値札を撮影して読み取るボタン。読み取り結果は onResult に渡し、保存は利用者の確認後に行う。
 *
 * onResult({ productName, priceTaxIncluded, priceTaxExcluded, quantity, unit, isSale })
 *   読み取れなかった項目は null
 */
export default function PriceTagScanButton({ productNames, onResult }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanning(true)
    setError('')
    try {
      const image = await resizeToJpegBase64(file)
      const { data, error: invokeError } = await supabase.functions.invoke('read-price-tag', {
        body: { image, mediaType: 'image/jpeg', productNames },
      })
      if (invokeError) throw invokeError
      if (data?.priceTaxIncluded == null && data?.priceTaxExcluded == null && !data?.productName) {
        setError('値札を読み取れませんでした。値札が大きく写るように撮り直してください')
        return
      }
      onResult(data)
    } catch (err) {
      console.error('値札読み取りエラー:', err)
      setError('読み取りに失敗しました。時間をおいて試すか、手で入力してください')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className={styles.scanArea}>
      <button
        type="button"
        className={styles.scanBtn}
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
      >
        <IconCamera /> {scanning ? '読み取り中...' : '値札を撮影して入力'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        hidden
      />
      {error && <p className={styles.errorMsg} role="alert">{error}</p>}
    </div>
  )
}
