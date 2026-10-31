import { useEffect, useRef, useState } from 'react'
import { IconSearch, IconBroadcast, IconStarFill, IconCheckCircle, IconPin } from '../../lib/icons'
import PlaceSearchInput from '../PlaceSearchInput'
import { haversineKm } from '../../utils/geo'
import styles from './MapPlaceSearch.module.css'

const RADIUS_OPTIONS = [1, 3, 5, 10]

// Google Maps の図形は CSS 変数を解釈できないため、トークンの実際の値を読み出して渡す
function tokenColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * お出かけリストの地図ビュー上に重ねる「地点検索」。
 * 地名・駅名・現在地を起点に地図を移動し、半径内に記録している場所を近い順に並べる。
 *
 * props:
 *   map            : google.maps.Map（初期化前は null）
 *   places         : 座標を持つ wish_places の行
 *   onCenterChange : (center | null) => void 起点が決まった / 解除されたとき
 *   onSelectPlace  : (place) => void 一覧から場所を選んだとき
 */
export default function MapPlaceSearch({ map, places, onCenterChange, onSelectPlace }) {
  const inputRef = useRef(null)
  const [center, setCenter] = useState(null)   // { lat, lng, label }
  const [radiusKm, setRadiusKm] = useState(3)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')

  const ranked = center
    ? places
        .map(place => ({ place, km: haversineKm(center.lat, center.lng, place.lat, place.lng) }))
        .sort((a, b) => a.km - b.km)
    : []
  const inRadius = ranked.filter(r => r.km <= radiusKm)
  const nearest = ranked[0] ?? null

  // 起点マーカーと半径の円を描き、円が収まるように地図を寄せる
  useEffect(() => {
    if (!map || !center) return
    let cancelled = false
    let marker = null
    let circle = null

    async function draw() {
      const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker')
      if (cancelled) return
      const dot = document.createElement('div')
      dot.className = styles.centerPin
      marker = new AdvancedMarkerElement({ map, position: center, content: dot, title: center.label })
      const color = tokenColor('--accent')
      circle = new window.google.maps.Circle({
        map,
        center,
        radius: radiusKm * 1000,
        strokeColor: color,
        strokeOpacity: 0.7,
        strokeWeight: 1.5,
        fillColor: color,
        fillOpacity: 0.08,
        clickable: false,
      })
      map.fitBounds(circle.getBounds(), 24)
    }
    draw().catch(err => console.error('検索地点の表示エラー:', err))

    return () => {
      cancelled = true
      if (marker) marker.map = null
      circle?.setMap(null)
    }
  }, [map, center, radiusKm])

  function updateCenter(next) {
    setCenter(next)
    onCenterChange?.(next)
  }

  function locateCurrent() {
    if (!navigator.geolocation) {
      setLocateError('この端末では現在地を取得できません')
      return
    }
    setLocating(true)
    setLocateError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        if (inputRef.current) inputRef.current.value = '現在地'
        updateCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: '現在地' })
      },
      err => {
        console.error('現在地の取得エラー:', err)
        setLocating(false)
        setLocateError('現在地を取得できませんでした。位置情報の許可を確認してください')
      },
      { timeout: 8000 }
    )
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = ''
    setLocateError('')
    updateCenter(null)
  }

  function selectPlace(place) {
    if (map) {
      map.panTo({ lat: place.lat, lng: place.lng })
      if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
    }
    onSelectPlace(place)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.searchRow}>
        <div className={styles.inputWrapper}>
          <span className={styles.inputIcon}><IconSearch /></span>
          <PlaceSearchInput
            id="map-place-search"
            inputRef={inputRef}
            inputClassName={styles.input}
            placeholder="地名・駅名で地図を移動"
            onPick={({ name, address, lat, lng }) => {
              if (lat == null || lng == null) {
                setLocateError('この場所の位置を取得できませんでした')
                return
              }
              setLocateError('')
              updateCenter({ lat, lng, label: name || address || inputRef.current?.value || '検索地点' })
            }}
          />
          {center && (
            <button type="button" className={styles.clearBtn} onClick={handleClear} aria-label="検索地点を解除">×</button>
          )}
        </div>
        <button
          type="button"
          className={styles.gpsBtn}
          onClick={locateCurrent}
          disabled={locating}
          aria-label="現在地の周辺を表示"
          title="現在地の周辺を表示"
        >
          {locating ? '…' : <IconBroadcast />}
        </button>
      </div>

      {locateError && <p className={styles.error} role="alert">{locateError}</p>}

      {center && (
        <section className={styles.panel} aria-label="検索地点の周辺にある場所">
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>
              <span className={styles.panelLabel}>{center.label}</span>
              <span className={styles.panelCount}>の周辺 {inRadius.length}件</span>
            </p>
            <div className={styles.radiusBtns} role="group" aria-label="検索半径">
              {RADIUS_OPTIONS.map(km => (
                <button
                  key={km}
                  type="button"
                  className={`${styles.radiusBtn} ${radiusKm === km ? styles.radiusBtnActive : ''}`}
                  onClick={() => setRadiusKm(km)}
                  aria-pressed={radiusKm === km}
                >{km}km</button>
              ))}
            </div>
          </div>

          {inRadius.length > 0 ? (
            <ul className={styles.results}>
              {inRadius.map(({ place, km }) => (
                <li key={place.id}>
                  <ResultChip place={place} km={km} onClick={() => selectPlace(place)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.noResult}>
              <span>半径{radiusKm}km以内に記録した場所はありません</span>
              {nearest && (
                <ResultChip place={nearest.place} km={nearest.km} prefix="いちばん近い" onClick={() => selectPlace(nearest.place)} />
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function ResultChip({ place, km, prefix, onClick }) {
  const visited = place.status === 'visited'
  return (
    <button type="button" className={styles.chip} onClick={onClick}>
      <span className={visited ? styles.chipVisited : styles.chipWant} aria-label={visited ? '行った' : '行きたい'}>
        {visited ? <IconCheckCircle /> : <IconStarFill />}
      </span>
      {prefix && <span className={styles.chipPrefix}>{prefix}</span>}
      <span className={styles.chipName}>{place.name}</span>
      <span className={styles.chipDistance}><IconPin />{km.toFixed(1)}km</span>
    </button>
  )
}
