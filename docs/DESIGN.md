# DESIGN.md — デザインシステム「灯 Akari」

Apple Human Interface Guidelines を参考にした、**ミニマルで温かなデザイン言語**。
トークン（CSS 変数）の定義はすべて `src/index.css`。**ここに載っている値をハードコードせず、必ず `var(--token)` で参照する。**

## デザイン思想

1. **静けさ**: 装飾より余白。画面の主役は家族のデータであり UI ではない
2. **温かさ**: 純白・純黒を使わず、和色由来の warm greige（温かみのある灰）を基調にする
3. **一貫性**: 全ページが同じトークン・同じ部品感覚で作られていること。ページ独自の色や影を発明しない
4. **配慮**: ダークモード・reduced-motion・キーボードフォーカスは「対応する」のではなく最初から前提

## カラーパレット

| トークン | ライト値 | 意味 |
|---|---|---|
| `--primary` | `#7C71A8` 鈍色花 | ブランド色。主ボタン・アクティブ状態・リンク |
| `--primary-light` / `--primary-mid` / `--primary-dark` / `--primary-glow` | — | primary の派生 |
| `--accent` / `--accent-light` | `#C0806A` 紅鳶 | 補助アクセント（多用しない） |
| `--accent-soft` / `--accent-soft-2` | — | 淡い面塗り |
| `--success` / `--danger` / `--warning` | 緑 / 赤 / 黄 | 状態色。削除ボタンは `--danger` |
| `--gray-50`〜`--gray-900` | warm greige ランプ | 旧来の中間色。**ダークモードで自動反転する** |

### セマンティックサーフェス（新規コードはこちらを優先）

| トークン | 用途 |
|---|---|
| `--bg` | ページ背景（背景グラデは `--grad-bg`） |
| `--surface` / `--surface-2` | カード・パネル / 一段沈んだ面 |
| `--ink` / `--ink-2` / `--ink-3` | 本文 / 補足 / プレースホルダ級のテキスト |
| `--border` / `--border-strong` | 罫線。ヘアライン基本 |
| `--glass` / `--glass-border` / `--glass-blur` | ガラス面（ヘッダー等、控えめに） |
| `--grad-primary` / `--grad-primary-soft` | ブランドグラデーション |

**ルール**: 色の直書き（`#fff`, `rgba(0,0,0,.5)` 等）は禁止。該当トークンがなければ DESIGN.md の更新を提案する。

## タイポグラフィ

- 本文: システムフォントスタック（-apple-system → Hiragino Sans → Noto Sans JP）。`body` に設定済みで指定不要
- 見出し・ブランド表現: `--font-display`（Shippori Mincho B1 の和文セリフ）。ページタイトルやロゴ的な箇所のみ
- 基本サイズ 1rem / 行間 1.55 / letter-spacing 0.01em（body 既定）
- input 類は `font-size: 16px` 未満にしない（iOS のズーム発動防止。`index.css` で設定済み）

## 余白・レイアウト

- 余白は `rem` の 0.25 刻み（0.25 / 0.5 / 0.75 / 1 / 1.5 / 2rem）を基本にする
- コンテンツ最大幅: `--max-w`（1140px）。中央寄せ
- モバイルファースト: 375px 幅で崩れないことを常に確認。横スクロールが必要な行（タブ等）はコンテナ内スクロールにする

## 角丸・影

| トークン | 用途 |
|---|---|
| `--radius` (0.75rem) | 入力・小ボタン |
| `--radius-lg` (1rem) | カード |
| `--radius-xl` (1.375rem) | モーダル・大きなパネル |
| `--radius-full` | ピル型ボタン・チップ・アバター |
| `--shadow` / `--shadow-md` / `--shadow-lg` | 静止面 / カード / モーダルの順に強く |
| `--shadow-glow` | フォーカスリング的な強調 |

影の直書き禁止。「浮いている度合い」は 3 段階のみ。

## アイコン

- ライブラリは **react-icons**（既存は主に `react-icons/bs` = Bootstrap Icons）。新しいアイコンセットを混ぜない
- 絵文字はコンテンツ寄りの装飾（ページタイトル「🛒 買い物リスト」等）として使用可。UI コントロールはアイコンコンポーネントを優先
- アイコンのみのボタンには **必ず `aria-label`（日本語）** を付ける

## アニメーション

- 定義済み keyframes（`fadeInUp`, `scaleIn`, `slideUp`, `fadeIn`, `spin`, `checkPop` 等）を再利用する。新規 keyframes の追加は最小限
- 用途は「出現」と「状態変化のフィードバック」のみ。常時動き続ける装飾は追加しない
- duration の目安: 150–300ms。`prefers-reduced-motion` は `index.css` がグローバルに無効化するため個別対応不要（ただしアニメーション前提の UI にしない）

## コンポーネントの型（詳細は [COMPONENTS.md](./COMPONENTS.md)）

- **ボタン**: 主要アクション = `--primary` 塗り + 白文字、キャンセル = `--surface-2` 塗り + `--ink-2`、破壊的 = `--danger`。`disabled` 時は透明度を下げ `cursor: default`
- **カード**: `--surface` + `--radius-lg` + `--shadow` + `--border` のヘアライン
- **フォーム**: ラベルは上置き。フォーカスは `:focus-visible`（グローバル定義: `--primary` の 2px アウトライン）に任せる
- **モーダル**: オーバーレイ（背景クリックで閉じる: `e.target === e.currentTarget` 判定）+ 中央カード。ヘッダーにタイトルと「×」閉じるボタン（`aria-label="閉じる"`）。`ShoppingPage` の `CreateListModal` が参照実装
- **ボトムシート**: モバイルで選択肢が多い場合に使用。`slideUp` で出現
- **ナビゲーション**: 各機能ページのヘッダー左端に「ホームへ戻る」ボタン（`BsHouseFill`）。ページ間の直接遷移は作らず、ホーム（アプリランチャー）経由を基本とする
- **空状態（EmptyState）**: アイコン（絵文字）+ 1 文の案内 + 可能なら次のアクション。データゼロの画面を空白にしない

## ダークモード

- `prefers-color-scheme: dark` でトークン値が自動で切り替わる（`index.css` に一括定義）
- **ページ側で `@media (prefers-color-scheme: dark)` を書かない**。トークンだけ使っていれば自動対応する。書きたくなったらトークン設計の不足なので DESIGN.md 更新を提案する
- 検証は両モードで行う（完了条件に含む）

## アクセシビリティ

- キーボードフォーカス可視化: グローバル `:focus-visible` に任せる。`outline: none` の上書き禁止
- アイコンのみボタン・閉じるボタンに `aria-label`、クリック可能な非 button 要素には `role="button"`
- コントラスト: 本文は `--ink`、`--ink-3` を本文に使わない（補足専用）
- タップターゲットは 44×44px 目安
- `prefers-reduced-motion` 対応はグローバル設定済み（壊さない）
