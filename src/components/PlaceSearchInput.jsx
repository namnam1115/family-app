import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconPin } from '../lib/icons'
import { PLACES_LIMITS, createPlacesSearch } from '../utils/placesAutocomplete'
import styles from './PlaceSearchInput.module.css'

/**
 * Google Places で場所を検索する入力欄。
 * 1 文字ごとに課金される `places.Autocomplete` ウィジェットの代わりに、
 * デバウンス・最小文字数・結果の使い回し・呼び出し上限をかけた候補リストを出す
 * （制限の考え方は `utils/placesAutocomplete.js`）。
 *
 * 候補リストは position: fixed のポータルで出すため、呼び出し側のレイアウトを崩さない。
 *
 * props:
 *   inputClassName : 入力欄のクラス（呼び出し側の見た目をそのまま使う）
 *   defaultValue   : 初期値（非制御入力）
 *   onPick         : ({ name, address, lat, lng }) => void 候補を選んだとき
 *   onType         : (value) => void 手入力されたとき
 *   inputRef       : 呼び出し側でも入力欄を参照したいとき
 */
export default function PlaceSearchInput({
  id,
  defaultValue = '',
  placeholder,
  inputClassName,
  autoFocus,
  inputRef: externalRef,
  onPick,
  onType,
}) {
  const [suggestions, setSuggestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [notice, setNotice] = useState('')
  const [rect, setRect] = useState(null)

  const localRef = useRef(null)
  const inputRef = externalRef ?? localRef
  const searchRef = useRef(null)
  const timerRef = useRef(0)
  const requestIdRef = useRef(0)

  if (!searchRef.current) searchRef.current = createPlacesSearch()

  const open = suggestions.length > 0 && rect

  const updateRect = useCallback(() => {
    const input = inputRef.current
    if (input) setRect(input.getBoundingClientRect())
  }, [inputRef])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // モーダル内でのスクロールにも候補リストを追従させる
  useEffect(() => {
    if (!suggestions.length) return
    const onMove = () => updateRect()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [suggestions.length, updateRect])

  function close() {
    setSuggestions([])
    setActiveIndex(-1)
  }

  async function runSearch(value) {
    const requestId = ++requestIdRef.current
    const { predictions, reason } = await searchRef.current.suggest(value)
    if (requestId !== requestIdRef.current) return // 古い入力の結果は捨てる
    if (reason === 'limit') {
      setNotice('地図検索の利用上限に達しました。名前を直接入力してください')
      close()
      return
    }
    setNotice('')
    updateRect()
    setSuggestions(predictions)
    setActiveIndex(-1)
  }

  function handleChange(e) {
    const value = e.target.value
    onType?.(value)
    clearTimeout(timerRef.current)
    if (value.trim().length < PLACES_LIMITS.minLength) {
      requestIdRef.current++
      close()
      return
    }
    // 入力が落ち着いてから 1 回だけ問い合わせる
    timerRef.current = setTimeout(() => runSearch(value), PLACES_LIMITS.debounceMs)
  }

  async function pick(prediction) {
    const label = prediction.structured_formatting?.main_text || prediction.description
    if (inputRef.current) inputRef.current.value = label
    close()
    clearTimeout(timerRef.current)
    const place = await searchRef.current.details(prediction.place_id)
    onPick?.(place ?? { name: label, address: prediction.description ?? '', lat: null, lng: null })
  }

  function handleKeyDown(e) {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => {
        const next = prev + (e.key === 'ArrowDown' ? 1 : -1)
        if (next < 0) return suggestions.length - 1
        if (next >= suggestions.length) return 0
        return next
      })
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      pick(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <>
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={!!open}
        aria-autocomplete="list"
        aria-controls={open ? `${id}-suggestions` : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${id}-suggestion-${activeIndex}` : undefined}
        className={inputClassName}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(close, 120)}
      />
      {notice && <p className={styles.notice}>{notice}</p>}
      {open && createPortal(
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className={styles.list}
          style={{ left: rect.left, top: rect.bottom + 4, width: rect.width }}
        >
          {suggestions.map((prediction, index) => (
            <li
              key={prediction.place_id}
              id={`${id}-suggestion-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(prediction)}
            >
              <IconPin className={styles.optionIcon} />
              <span className={styles.optionText}>
                <span className={styles.optionMain}>
                  {prediction.structured_formatting?.main_text || prediction.description}
                </span>
                {prediction.structured_formatting?.secondary_text && (
                  <span className={styles.optionSub}>{prediction.structured_formatting.secondary_text}</span>
                )}
              </span>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  )
}
