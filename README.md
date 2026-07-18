# 家族プラットフォーム（family-app)

家族の日常の共有ごと — 買い物・献立・予定・在庫・お出かけ・旅行・家計 — を 1 か所に集める PWA。
React 19 + Vite + Supabase 製。家族メンバー間でリアルタイムに同期します。

## クイックスタート

```bash
npm install
cp .env.example .env   # Supabase の URL / anon キー等を設定
npm run dev            # 開発サーバー (Vite)
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド（変更完了の必須ゲート） |
| `npm run preview` | 本番ビルドのプレビュー |

### 環境変数（`.env`）

```
VITE_SUPABASE_URL=          # Supabase プロジェクト URL
VITE_SUPABASE_ANON_KEY=     # Supabase anon キー
VITE_VAPID_PUBLIC_KEY=      # Push 通知用 VAPID 公開鍵
VITE_GOOGLE_MAPS_API_KEY=   # お出かけリストの地図機能
```

### データベース

マイグレーションは `supabase/migrations/` に連番で管理（自動適用なし）。新規環境では 001 から順に Supabase ダッシュボードまたは `supabase db push` で適用します。詳細: [docs/DATABASE.md](./docs/DATABASE.md)

## 主な機能

買い物リスト / 価格比較 / 家計 / お出かけリスト / 食べたいおかず / 予定表（シフト対応）/ 在庫管理 / 旅行記録。
一覧と仕様は [docs/FEATURES.md](./docs/FEATURES.md)。

## ドキュメント（開発ハーネス）

このリポジトリは AI 駆動開発を前提とし、どの AI・誰が開発しても品質が揃うようドキュメントを整備しています。**開発に着手する前に必ず参照してください。**

| ドキュメント | 内容 |
|---|---|
| [docs/PROJECT.md](./docs/PROJECT.md) | プロジェクト概要・優先順位・開発方針 |
| [docs/AI_RULES.md](./docs/AI_RULES.md) | **AI 開発ルール・開発フロー・完了条件（必読）** |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | システム構成・データフロー |
| [docs/FEATURES.md](./docs/FEATURES.md) | 機能一覧・新機能追加チェックリスト |
| [docs/DATABASE.md](./docs/DATABASE.md) | テーブル定義・RLS・マイグレーション運用 |
| [docs/API.md](./docs/API.md) | Supabase アクセスパターン・Edge Functions |
| [docs/DESIGN.md](./docs/DESIGN.md) | デザインシステム「灯 Akari」 |
| [docs/COMPONENTS.md](./docs/COMPONENTS.md) | コンポーネント設計・ディレクトリ構成 |
| [docs/STYLE_GUIDE.md](./docs/STYLE_GUIDE.md) | 命名規則・コーディング規約 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Git 運用（ブランチ・コミット・PR・リリース） |
| [CHANGELOG.md](./CHANGELOG.md) | 変更履歴 |

## 技術スタック

React 19 (JavaScript/JSX) · Vite 7 · react-router-dom 7 · CSS Modules · vite-plugin-pwa · Supabase (Auth / PostgreSQL+RLS / Realtime / Storage / Edge Functions) · Web Push (VAPID) · Vercel
