# DATABASE.md — データベース設計とマイグレーション運用

Supabase PostgreSQL。**全テーブルで RLS（Row Level Security）を有効化**し、`get_my_family_id()` で家族スコープを強制する。アプリコード側で家族の絞り込みを忘れてもデータは漏れない設計だが、コード側でも `family_id` を明示して書く（インデックス効率と可読性のため）。

## セキュリティの中核

```sql
-- 002_rls_policies.sql — 現在ユーザーの family_id を返すヘルパー
create or replace function get_my_family_id()
returns uuid language sql security definer stable
as $$
  select family_id from family_members where user_id = auth.uid() limit 1;
$$;
```

- ユーザーは **最大 1 家族**に所属（`family_members.user_id` に unique 制約）
- 家族スコープの全テーブルの RLS は `family_id = get_my_family_id()` パターン
- 例外: `families` の SELECT は認証済み全員に許可（招待リンク `/join/:familyId` で未所属ユーザーが検索するため。UUID は推測困難）。`push_subscriptions` は `user_id = auth.uid()`（本人のみ）

## テーブル一覧

| テーブル | 機能 | 主なカラム | Realtime |
|---|---|---|---|
| `families` | 家族グループ | name | |
| `family_members` | メンバー | family_id, user_id (UK), name, email | |
| `family_settings` | 家族ごとの通知設定 | notification_enabled, notification_hour (0-23) | |
| `shopping_lists` | 買い物リスト | family_id, name, created_by, is_favorite | ✅ |
| `shopping_items` | 買い物アイテム | list_id, name, memo, added_by, checked, checked_at, important | ✅ |
| `price_stores` | 価格比較の店舗マスタ | family_id, name, sort_order | |
| `price_items` | 価格記録 | family_id, store_name, product_name, price numeric(10,2), note, icon, UNIQUE(family_id, store_name, product_name) | |
| `push_subscriptions` | Web Push 購読（デバイスごと） | user_id, family_id, endpoint, p256dh, auth, UNIQUE(user_id, endpoint) | |
| `dish_categories` | 献立カテゴリ | family_id, name, sort_order | ✅ |
| `dishes` | 食べたいおかず | family_id, name, category_id, url, image_url, added_by → family_members, cooked_at, rating (1-5), review | ✅ |
| `schedule_events` | 予定 | family_id, title, memo, all_day, start_date/end_date または start_datetime/end_datetime, member_id, shift_type (日勤/夜勤/明け/休み), updated_at 自動更新トリガー | ✅ |
| `schedule_event_history` | 予定の変更履歴 | event_id, changed_by, action (created/updated), snapshot jsonb | |
| `inventory_items` | 在庫 | family_id, name, quantity, unit, category, stock_status (ok/low/out), expiry_date, note | |
| `travel_trips` | 旅行 | family_id, title, start_date, end_date, prefecture, memo, schedule_event_id | ✅ |
| `travel_activities` | 旅行内アクティビティ | trip_id, family_id, order_index, title, memo | ✅ |
| `wish_places` | お出かけしたい場所 | family_id, name, url, lat, lng, tags text[], added_by → family_members ほか（⚠️ 下記参照） | ✅（コード上購読） |
| `budget_categories` | 家計カテゴリ | family_id, name, sort_order（⚠️ 下記参照） | ✅（コード上購読） |
| `budget_entries` | 家計エントリ | family_id, category_id, member_id ほか（⚠️ 下記参照） | ✅（コード上購読） |

### Storage バケット

| バケット | 用途 | ポリシー |
|---|---|---|
| `dish-thumbnails` | 献立サムネイル永続保存（TikTok 等の期限付き URL 対策） | public 読み取り / 書き込みは Edge Function（service_role）のみ。5MB・画像 MIME 限定 |

### ⚠️ 既知の課題: マイグレーション欠落

`wish_places`・`budget_categories`・`budget_entries` はアプリコードで使用されているが、**CREATE TABLE マイグレーションがリポジトリに存在しない**（Supabase ダッシュボードで直接作成されたと推定。`015` と `023` は `wish_places` への ALTER のみ）。

- これらのテーブルを変更する際は、まず本番スキーマを確認すること
- 復元マイグレーション（`CREATE TABLE IF NOT EXISTS` + RLS）の追加が望ましい — 対応時はこの節を更新する

## マイグレーション運用ルール

1. **追加のみ**: `supabase/migrations/NNN_短い英語名.sql`（NNN は 3 桁連番）。**適用済みファイルの編集・削除は禁止**
2. **1 ファイルに完結**: テーブル作成 + RLS 有効化 + ポリシー + インデックス + （必要なら）`ALTER PUBLICATION supabase_realtime ADD TABLE 〜` を同じファイルに書く
3. **冪等に書く**: `IF NOT EXISTS` / `IF EXISTS` を付ける
4. **手動適用**: 自動適用の仕組みはない。Supabase ダッシュボードの SQL Editor か `supabase db push` で適用する。**PR・完了報告に「要適用マイグレーション」を必ず明記**
5. **コメントは日本語**で用途を書く（既存慣習）

### 新テーブルのテンプレート

```sql
-- 用途の説明
CREATE TABLE IF NOT EXISTS example_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS example_items_family_id_idx ON example_items(family_id);

ALTER TABLE example_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members can manage example_items"
  ON example_items FOR ALL TO authenticated
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());

-- リアルタイム同期が必要な場合のみ
ALTER PUBLICATION supabase_realtime ADD TABLE example_items;
```

### 設計指針

- 主キーは `uuid DEFAULT gen_random_uuid()`（履歴系のみ `bigserial` 可）
- 家族スコープのテーブルには必ず `family_id ... ON DELETE CASCADE`
- 「誰が」を記録する場合: 表示専用なら `text`（`added_by`/`updated_by` に表示名）、参照整合が要るなら `uuid REFERENCES family_members(id) ON DELETE SET NULL`
- 金額は `numeric` を使う（`price_items.price` が integer → numeric(10,2) に移行した経緯あり）
- 列挙値は `text` + `CHECK` 制約（例: `stock_status IN ('ok','low','out')`）
- 頻出の絞り込み・並び替えには複合インデックス（例: `(family_id, start_date)`）
