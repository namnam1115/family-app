# STYLE_GUIDE.md — 命名規則・コーディング規約

## 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| ページファイル | PascalCase + `Page` 接尾辞 | `ShoppingPage.jsx` / `ShoppingPage.module.css` |
| コンポーネントファイル | PascalCase | `ShoppingItemList.jsx` |
| lib / utils / hooks | camelCase | `pushNotifications.js`, `googleMaps.js` |
| コンポーネント名 | PascalCase、ファイル名と一致 | `export default function ShoppingPage()` |
| カスタムフック | `use` 接頭辞 + camelCase | `useAuth`, `useRealtimeList` |
| 変数・関数 | camelCase。イベントハンドラは `handleXxx`、props のコールバックは `onXxx` | `handleCreateList`, `onClose` |
| boolean | `is` / `has` / `show` / `loading` 接頭辞 | `isFavorite`, `showCreate`, `loadingLists` |
| 定数（真の定数のみ） | UPPER_SNAKE_CASE | `MAX_NAME_LENGTH` |
| CSS Module クラス | camelCase（`styles.xxx` で参照するため） | `styles.tabsBar`, `styles.saveBtn` |
| CSS 変数（トークン） | kebab-case、`index.css` にのみ定義 | `--surface-2`, `--radius-lg` |
| DB テーブル | snake_case・複数形 | `shopping_items`, `travel_trips` |
| DB カラム | snake_case | `family_id`, `created_at`, `is_favorite` |
| マイグレーション | `NNN_短い英語名.sql`（3 桁連番） | `021_travels.sql` |
| Edge Function | kebab-case | `fetch-og-image` |
| Supabase チャンネル名 | `テーブル名_changes` または `テーブル名_rt` | `shopping_lists_changes` |

**JS ↔ DB の境界**: DB のカラムは snake_case のまま JS 内で扱う（`familyMember.family_id`）。キャメルケースへの変換層は作らない。

## JavaScript / React 規約

- **セミコロンなし・シングルクォート・インデント 2 スペース**（既存コードに合わせる）
- 関数コンポーネント + Hooks のみ。クラスコンポーネント・HOC 禁止
- `useEffect` は目的ごとに分ける（初期フェッチ / Realtime 購読 / 派生状態を 1 つの effect に混ぜない）
- 依存配列は正しく書く。フェッチ関数は `useCallback` でメモ化して依存に入れる（`ShoppingPage.fetchLists` パターン）
- 購読・タイマー等は必ずクリーンアップを返す
- 条件描画は `&&` / 三項演算子。ネストが深くなるなら早期 return かコンポーネント分割
- `async/await` を使う（`.then()` チェーン禁止。初期化処理など既存の一部を除く）
- 日付は素の `Date` で扱う（日付ライブラリ追加禁止）

## 状態管理

- グローバル: `AuthContext`（`user` / `familyMember` / auth 操作）のみ
- ページローカル: `useState`。サーバーデータは「取得結果をそのまま state に持ち、変更時は楽観的更新 + Realtime 再フェッチ」
- Redux / Zustand / TanStack Query 等の導入はしない（提案は可）

## エラーハンドリング / ログ

- Supabase 呼び出しの `error` は握りつぶさない。最低限 `console.error('〜エラー:', error)`（日本語プレフィックス + error オブジェクト）
- ユーザー操作の失敗は UI に返す: 楽観的更新のロールバック、またはメッセージ表示
- `throw` するのは呼び出し側（フォーム等）が catch して表示する場合のみ（`AuthContext` のパターン)
- 本番に `console.log` デバッグ出力を残さない（`console.error` / `console.warn` は可）

## バリデーション

- クライアント: 入力は `trim()` し、空なら送信させない（ボタン `disabled`）。`maxLength` を input に付ける
- DB: 本命の制約は DB 側（`CHECK`, `UNIQUE`, `NOT NULL`）に置く。クライアント側は UX のため
- Edge Functions: 外部入力（URL 等）は必ず検証（`fetch-og-image` の URL 検証が参照実装）

## パフォーマンス

- `select()` はカラム明示。一覧に不要な巨大カラム（jsonb 等）を取らない
- ループ内クエリ（N+1）禁止。`in()` でまとめて取得し JS 側でマップする（`ShoppingPage` の未チェック数集計が参照実装）
- 画像は Supabase Storage の公開 URL を使い、`loading="lazy"` を付ける
- `React.memo` / `useMemo` は計測に基づく場合のみ。予防的最適化はしない
- バンドル追加に注意: 重い依存の追加は要相談

## テスト

現状テストランナー未導入。導入までの検証は:

1. `npm run build` の成功（必須ゲート）
2. 変更画面の手動確認（ライト / ダーク、モバイル幅）

テスト基盤（Vitest 等）を導入する場合はプロジェクトオーナーの承認を得て、本ガイドと [AI_RULES.md](./AI_RULES.md) の完了条件を更新すること。

## CSS 規約

- CSS Modules のみ。グローバル CSS への追記は `index.css`（トークン・リセット・keyframes）に限る
- 色・影・角丸・フォントは必ずトークン参照（[DESIGN.md](./DESIGN.md)）
- セレクタはクラス単体を基本にし、深いネスト・タグセレクタ・`!important` を避ける
- メディアクエリはモバイルファースト（`min-width` で拡張）
