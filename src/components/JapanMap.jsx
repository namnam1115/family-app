import { JAPAN_PREFECTURE_PATHS, JAPAN_MAP_VIEWBOX } from '../data/japanPrefecturePaths'
import styles from './JapanMap.module.css'

export default function JapanMap({ visited, selected, onSelect }) {
  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={JAPAN_MAP_VIEWBOX}
        role="img"
        aria-label="日本地図（旅行記録のある都道府県のハイライト表示）"
      >
        {JAPAN_PREFECTURE_PATHS.map(pref => {
          const isVisited = visited.has(pref.name)
          const isSelected = selected === pref.name
          return (
            <path
              key={pref.name}
              d={pref.d}
              role="button"
              tabIndex={0}
              aria-label={`${pref.name}（${isVisited ? '訪問済み' : '未訪問'}）`}
              aria-pressed={isSelected}
              className={[
                styles.pref,
                isVisited ? styles.visited : styles.unvisited,
                isSelected ? styles.selected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(isSelected ? null : pref.name)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(isSelected ? null : pref.name)
                }
              }}
            >
              <title>{pref.name}</title>
            </path>
          )
        })}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.visited}`} />
          訪問済み（{visited.size}/47）
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.unvisited}`} />
          未訪問
        </span>
      </div>
    </div>
  )
}
