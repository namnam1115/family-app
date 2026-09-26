import { createPortal } from 'react-dom'
// Tabler Icons（線画・メイン）
import {
  TbMeat, TbPig, TbSausage, TbGrill, TbChefHat,
  TbFishBone, TbMushroom, TbLeaf, TbLeaf2, TbSeedling,
  TbLemon, TbLemon2,
  TbMilk, TbMilkshake,
  TbBottle, TbTeapot, TbGlass, TbGlassFull, TbDroplet,
  TbSalt, TbIceCream,
  TbToiletPaper, TbRazor, TbSpray, TbPills, TbWashMachine, TbVacuumCleaner, TbHandSanitizer, TbBucket,
  TbShoppingCart, TbPackage, TbTag, TbBasket, TbBox, TbStar, TbHeart,
} from 'react-icons/tb'
// Lucide Icons（線画・果物・野菜・食材）
import {
  LuBeef, LuFish, LuEgg, LuEggFried, LuMilk,
  LuCarrot, LuLeafyGreen, LuSprout, LuSalad,
  LuApple, LuGrape, LuCherry, LuBanana,
  LuBeer, LuWine, LuCoffee,
  LuWheat, LuCroissant, LuSoup, LuCandy, LuCake, LuCookie, LuNut,
} from 'react-icons/lu'
// Phosphor Icons（線画・牛・エビ・その他）
import { PiCow, PiShrimp, PiOrange, PiLeaf, PiAvocado, PiPepper, PiCheese } from 'react-icons/pi'
// Game Icons（鶏のみ）
import { GiChicken } from 'react-icons/gi'
import styles from './Price.module.css'

// 使用するアイコンのマップ
const ICON_MAP = {
  // 肉類
  TbMeat, TbPig, LuBeef, GiChicken, TbSausage, TbGrill, TbChefHat,
  // 魚介
  LuFish, TbFishBone, PiShrimp,
  // 野菜（象徴含む）
  LuSprout, LuLeafyGreen, LuSalad,
  LuCarrot, TbMushroom, PiPepper, PiAvocado, TbLeaf, TbLeaf2, TbSeedling, PiLeaf,
  // 果物（象徴含む）
  LuApple, LuGrape,
  LuCherry, LuBanana, PiOrange, TbLemon, TbLemon2,
  // 乳製品・卵
  TbMilk, LuMilk, LuEgg, LuEggFried, PiCheese, TbMilkshake,
  // 飲み物
  TbBottle, LuBeer, LuCoffee, TbTeapot, TbGlass, TbGlassFull, LuWine, TbDroplet,
  // 加工・食材
  LuWheat, LuCroissant, LuSoup, TbSalt, LuCandy, LuCake, LuCookie, TbIceCream, LuNut,
  // 日用品
  TbToiletPaper, TbRazor, TbSpray, TbPills, TbWashMachine, TbVacuumCleaner, TbHandSanitizer, TbBucket,
  // その他
  TbShoppingCart, TbPackage, TbTag, TbBasket, TbBox, TbStar, TbHeart,
  // 牛
  PiCow,
}

// アイコン名を受け取ってコンポーネントを返す
export function Icon({ name, size, className, style }) {
  const Comp = ICON_MAP[name] || TbShoppingCart
  return <Comp size={size} className={className} style={style} />
}

// ── アイコン定義 ──────────────────────────────────────────
const ICON_GROUPS = [
  { label: '肉・加工肉',   icons: ['TbMeat','TbPig','PiCow','LuBeef','GiChicken','TbSausage','TbGrill','TbChefHat'] },
  { label: '魚介',        icons: ['LuFish','TbFishBone','PiShrimp'] },
  { label: '野菜',        icons: ['LuSprout','LuLeafyGreen','LuSalad','LuCarrot','PiPepper','TbMushroom','PiAvocado','TbLeaf','TbSeedling'] },
  { label: '果物',        icons: ['LuApple','LuGrape','LuCherry','LuBanana','PiOrange','TbLemon'] },
  { label: '乳製品・卵',   icons: ['TbMilk','LuEgg','LuEggFried','PiCheese','TbMilkshake'] },
  { label: '飲み物',      icons: ['TbBottle','LuBeer','LuCoffee','TbTeapot','TbGlass','LuWine','TbDroplet'] },
  { label: '加工・食材',   icons: ['LuWheat','LuCroissant','LuSoup','TbSalt','LuCandy','LuCake','LuCookie','TbIceCream','LuNut'] },
  { label: '日用品',      icons: ['TbToiletPaper','TbRazor','TbSpray','TbPills','TbWashMachine','TbVacuumCleaner','TbHandSanitizer','TbBucket'] },
  { label: 'その他',      icons: ['TbShoppingCart','TbPackage','TbTag','TbBasket','TbBox','TbStar','TbHeart'] },
]

// ── アイコンピッカー ──────────────────────────────────────
export function IconPicker({ value, onChange, onClose }) {
  // 価格追加モーダル（body 直下に描画）より前面に出すため、こちらも body 直下へ描画する
  return createPortal(
    <div className={styles.iconPickerOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.iconPickerPanel}>
        <div className={styles.iconPickerHeader}>
          <span className={styles.iconPickerTitle}>アイコンを選択</span>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="閉じる">×</button>
        </div>
        <div className={styles.iconPickerBody}>
          {ICON_GROUPS.map(group => (
            <div key={group.label}>
              <div className={styles.iconGroupLabel}>{group.label}</div>
              <div className={styles.iconGrid}>
                {group.icons.map(ico => (
                  <button
                    key={ico}
                    type="button"
                    className={`${styles.iconBtn} ${value === ico ? styles.iconBtnActive : ''}`}
                    onClick={() => onChange(ico)}
                    title={ico.replace(/^Tb/, '')}
                  >
                    <Icon name={ico} size={24} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
