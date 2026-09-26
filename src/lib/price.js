// 価格比較（PricePage）の計算・表示用ヘルパー

export function formatPrice(p) {
  return Number(p).toLocaleString('ja-JP', { maximumFractionDigits: 2 })
}

/**
 * 内容量の単位。base が同じもの同士は換算して比較できる。
 * per は「◯あたり」の表示量（g / ml は 100 あたり、個数系は 1 あたり）。
 */
export const UNITS = [
  { value: 'g',    base: 'g',    factor: 1,    per: 100 },
  { value: 'kg',   base: 'g',    factor: 1000, per: 100 },
  { value: 'ml',   base: 'ml',   factor: 1,    per: 100 },
  { value: 'L',    base: 'ml',   factor: 1000, per: 100 },
  { value: '個',   base: '個',   factor: 1,    per: 1 },
  { value: '枚',   base: '枚',   factor: 1,    per: 1 },
  { value: '本',   base: '本',   factor: 1,    per: 1 },
  { value: '袋',   base: '袋',   factor: 1,    per: 1 },
  { value: 'ロール', base: 'ロール', factor: 1,    per: 1 },
  { value: 'm',    base: 'm',    factor: 1,    per: 1 },
]

const UNIT_MAP = Object.fromEntries(UNITS.map(u => [u.value, u]))

function baseLabel(unit) {
  return `${unit.per}${unit.base}あたり`
}

/** 内容量が入っている行の単価 { value, label, shortLabel, base }。なければ null */
export function unitPriceOf(item) {
  const unit = UNIT_MAP[item?.unit]
  const qty = Number(item?.quantity)
  if (!unit || !(qty > 0)) return null
  return {
    value: (Number(item.price) / (qty * unit.factor)) * unit.per,
    label: baseLabel(unit),
    // 一覧表のセルなど狭い場所用（例: 「100g」）
    shortLabel: `${unit.per}${unit.base}`,
    base: unit.base,
  }
}

/** 入力途中の値から単価の表示文字列を作る（プレビュー用） */
export function previewUnitPrice(price, quantity, unit) {
  if (price === '' || quantity === '') return ''
  const up = unitPriceOf({ price, quantity, unit })
  return up ? `${up.label} ¥${formatPrice(up.value)}` : ''
}

export function formatQuantity(item) {
  const qty = Number(item?.quantity)
  if (!item?.unit || !(qty > 0)) return ''
  return `${formatPrice(qty)}${item.unit}`
}

/**
 * 1 商品の店舗別の行（価格登録済みのもの）を比較する。
 * 全行に換算可能な内容量があれば単価で、そうでなければ価格そのもので比べる。
 * 内容量がバラバラな行を価格だけで比べると誤判定するため、混在時は価格比較に倒す。
 */
export function buildComparison(rows) {
  if (rows.length === 0) return null
  const units = rows.map(unitPriceOf)
  const byUnit = units.every(u => u && u.base === units[0].base)
  const scoreOf = row => (byUnit ? unitPriceOf(row).value : Number(row.price))

  let best = rows[0]
  let maxScore = scoreOf(rows[0])
  for (const row of rows) {
    const score = scoreOf(row)
    if (score < scoreOf(best)) best = row
    if (score > maxScore) maxScore = score
  }
  const bestScore = scoreOf(best)
  const latest = rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), '')

  return {
    byUnit,
    unitLabel: byUnit ? units[0].label : '',
    unitShort: byUnit ? units[0].shortLabel : '',
    best,
    bestScore,
    count: rows.length,
    // 最安と最高の差の割合。1 店舗のみなら 0
    spreadRate: bestScore > 0 ? (maxScore - bestScore) / bestScore : 0,
    latest,
    scoreOf,
    isBest: row => scoreOf(row) === bestScore,
  }
}

/** 最安との差の表示（例: 「+¥30 (+12%)」「+¥5/100g (+8%)」）。最安なら空文字 */
export function formatDiff(comparison, row) {
  const diff = comparison.scoreOf(row) - comparison.bestScore
  if (!(diff > 0)) return ''
  const rate = comparison.bestScore > 0 ? Math.round((diff / comparison.bestScore) * 100) : null
  const suffix = comparison.byUnit ? `/${comparison.unitShort}` : ''
  return `+¥${formatPrice(diff)}${suffix}${rate ? ` (+${rate}%)` : ''}`
}

/** 更新日の相対表示（「今日」「3日前」「2か月前」） */
export function formatUpdatedAt(iso) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return '今日'
  if (days === 1) return '昨日'
  if (days < 30) return `${days}日前`
  if (days < 365) return `${Math.floor(days / 30)}か月前`
  return `${Math.floor(days / 365)}年前`
}

/** 古くて実勢と離れている可能性が高い価格か（3 か月以上前） */
export function isStale(iso) {
  return !!iso && Date.now() - new Date(iso).getTime() > 90 * 86400000
}

/**
 * 検索用の正規化。全角/半角・大小文字・空白、カタカナ/ひらがなの違いを無視する
 * （「ギュウニュウ」「ぎゅうにゅう」「ｷﾞｭｳﾆｭｳ」を同じ語として扱う）。
 */
export function normalizeSearchText(text) {
  if (!text) return ''
  return String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
}
