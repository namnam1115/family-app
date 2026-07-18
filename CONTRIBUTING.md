# CONTRIBUTING.md — Git 運用ルール

人間・AI を問わず、このリポジトリへの変更は以下に従う。

## ブランチ戦略

GitHub Flow（シンプルな main + 作業ブランチ）。

- **`main`**: 常にデプロイ可能。merge すると Vercel が本番へ自動デプロイする。**直接 push 禁止**
- **作業ブランチ**: `main` から分岐し、1 目的 1 ブランチ

### ブランチ命名

```
<type>/<短い英語の説明>
```

例: `feature/inventory-expiry`, `fix/shopping-tab-overflow`, `docs/ai-harness`, `refactor/extract-modal`

| type | 用途 |
|---|---|
| `feature` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみ |
| `refactor` | 挙動を変えない整理 |
| `chore` | 依存更新・設定変更 |

（AI ツールが自動生成するブランチ名 `claude/〜` 等はそのままでよい）

## コミットルール

- **1 コミット = 1 まとまり**。動かない中間状態をコミットしない
- メッセージは**日本語の要約 1 行**（既存慣習）。何を・なぜが分かるように
  - 良い例: `お出かけリストにタグ検索と「今日はどこ行く？」導線を追加`
  - 悪い例: `update` / `fix` / `修正`
- 本文が必要なら 1 行空けて補足（適用が必要なマイグレーション等）
- `.env`・秘密鍵・`node_modules` をコミットしない

## Pull Request ルール

- PR は小さく。目安: 差分 500 行以内（マイグレーション・lock ファイル除く）
- PR 説明に必ず書くこと:
  1. **目的**（何のための変更か）
  2. **変更内容**（画面があればスクリーンショット推奨）
  3. **要適用マイグレーション / Edge Function デプロイの有無**
  4. **確認方法**（どの画面で何を確認したか。ライト / ダーク / モバイル幅）
- merge 前チェック: `npm run build` 成功、[docs/AI_RULES.md](./docs/AI_RULES.md) の完了条件を満たす
- merge 方式: merge commit（既存慣習）。self-merge 可（家族運用のため）だが、DB スキーマ・RLS・認証に触る PR はセルフレビューを丁寧に

## リリースフロー

1. PR を `main` に merge → Vercel が自動デプロイ
2. **デプロイ前に**必要なマイグレーションを Supabase に適用する（後方互換のあるスキーマ変更を先に適用 → コードをデプロイ、の順が安全）
3. Edge Functions に変更があれば `supabase functions deploy <name>` を実行
4. [CHANGELOG.md](./CHANGELOG.md) の `Unreleased` を確認し、まとまった節目で日付付きセクションに切り出す
5. デプロイ後、本番でスモーク確認（ログイン → 変更した画面）

## ロールバック

- アプリ: Vercel のダッシュボードから前のデプロイに戻す（または revert PR を merge）
- DB: 適用済みマイグレーションは巻き戻さず、**打ち消しの新規マイグレーション**を追加する
