# PROJECT.md — プロジェクト概要

## アプリの目的

**家族プラットフォーム（family-app）** は、家族の日常のちいさな共有ごとを 1 か所に集める PWA です。
買い物リスト・献立・予定・在庫・お出かけ先・旅行・家計を、家族メンバー間でリアルタイムに共有します。

「家族専用のスーパーアプリ」— 個別アプリを行き来せず、ホーム画面（アプリランチャー）から必要な機能へ 1 タップで到達できることを重視します。

## コンセプト

- **共有ファースト**: すべてのデータは「家族」単位。個人メモアプリではない。誰かが追加すれば全員に即時反映される（Supabase Realtime）
- **スマホ最優先**: 利用シーンは台所・スーパー・外出先。PWA としてホーム画面に追加して使う前提。デスクトップは補助
- **迷わない UI**: 「灯 Akari」デザインシステム（[DESIGN.md](./DESIGN.md)）による、Apple HIG 準拠のミニマルで温かな UI。機能ごとに画面は完結し、深い階層を作らない
- **運用コストほぼゼロ**: Supabase 無料枠 + Vercel で維持できる構成を守る

## ターゲットユーザー

- 主対象: 共働き・子育て世帯の夫婦（2〜4 人程度の家族グループ）
- ITリテラシー: 特別高くない前提。Google ログインだけで使い始められること
- デバイス: iPhone / Android のブラウザ・PWA

## 優先順位（迷ったらこの順で判断）

1. **データの安全性** — RLS による家族スコープの徹底。他の家族のデータが見える事故は絶対に起こさない
2. **既存機能を壊さないこと** — 家族が毎日使っている。デグレ > 新機能の遅れ
3. **スマホでの使いやすさ** — タップしやすさ、表示速度、オフライン耐性
4. **開発のしやすさ・保守性** — 誰（どの AI）が触っても同じ品質で拡張できること
5. **新機能・リッチな表現** — 上記を満たした上で

## 開発方針

- **小さく作り、小さく出す**: 1 機能 = 1 ブランチ = 1 PR。巨大な変更を避ける
- **DB が契約**: スキーマ変更は必ず `supabase/migrations/` に SQL を追加し、RLS ポリシーとセットで書く（[DATABASE.md](./DATABASE.md)）
- **フロントは薄く**: サーバーサイドロジックは RLS と Edge Functions に寄せ、React 側は取得・表示・楽観的更新に徹する
- **共通化は 3 回目から**: 2 箇所の重複は許容し、3 箇所目が現れたら共通コンポーネント / フックに抽出する（[COMPONENTS.md](./COMPONENTS.md)）
- **AI 駆動開発**: 実装は主に AI（Claude Code / ChatGPT / Cursor 等）が行う。AI は必ず [AI_RULES.md](./AI_RULES.md) に従うこと

## 現在の技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | React 19 + Vite 7 | **JavaScript (JSX)**。TypeScript ではない |
| ルーティング | react-router-dom 7 | |
| スタイリング | CSS Modules | ページ / コンポーネントごとに `.module.css` |
| デザイン | 「灯 Akari」デザイントークン | `src/index.css` の CSS 変数 |
| PWA | vite-plugin-pwa + Workbox | Push 用カスタム SW: `public/sw-push.js` |
| 認証 | Supabase Auth (Google OAuth) | |
| DB | Supabase PostgreSQL + RLS | |
| リアルタイム | Supabase Realtime | |
| サーバー処理 | Supabase Edge Functions (Deno / TypeScript) | |
| ホスティング | Vercel (GitHub 連携自動デプロイ) | `main` への merge で本番反映 |

## ドキュメントマップ

| ドキュメント | 内容 |
|---|---|
| [AI_RULES.md](./AI_RULES.md) | AI が開発時に守るルール・開発フロー・完了条件 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | システム構成図・データフロー |
| [FEATURES.md](./FEATURES.md) | 機能一覧と各ページの仕様 |
| [DATABASE.md](./DATABASE.md) | テーブル定義・RLS・マイグレーション運用 |
| [API.md](./API.md) | Supabase アクセスパターン・Edge Functions |
| [DESIGN.md](./DESIGN.md) | デザインシステム「灯 Akari」ガイドライン |
| [COMPONENTS.md](./COMPONENTS.md) | コンポーネント設計・共通コンポーネント |
| [STYLE_GUIDE.md](./STYLE_GUIDE.md) | 命名規則・コーディング規約 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Git 運用（ブランチ・コミット・PR・リリース） |
| [../CHANGELOG.md](../CHANGELOG.md) | 変更履歴 |
