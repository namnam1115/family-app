# FEATURES.md — 機能一覧

各機能は `src/pages/` の 1 ページに対応する。新機能の追加・変更時はこの表を更新すること。

## ルート一覧

| パス | ページ | 認証 | 主なテーブル |
|---|---|---|---|
| `/` | HomePage（アプリランチャー + 認証） | 不要（未ログイン時はログイン UI） | families, family_members |
| `/join/:familyId` | JoinPage（招待リンクで家族参加） | 不要（参加時にログイン誘導） | families, family_members |
| `/shopping` | ShoppingPage 買い物リスト | 必要 | shopping_lists, shopping_items |
| `/price` | PricePage 価格比較 | 必要 | price_stores, price_items |
| `/budget` | BudgetPage 家計 | 必要 | budget_categories, budget_entries |
| `/places` | PlacesPage お出かけリスト | 必要 | wish_places |
| `/dishes` | DishesPage 食べたいおかず | 必要 | dish_categories, dishes |
| `/schedule` | SchedulePage 予定表 | 必要 | schedule_events, schedule_event_history |
| `/inventory` | InventoryPage 在庫管理 | 必要 | inventory_items |
| `/travels` | TravelPage 旅行記録 | 必要 | travel_trips, travel_activities |

## 機能概要

### ホーム（HomePage）
- 未ログイン: Google ログインボタン
- ログイン済み・家族未所属: `GroupSetup`（家族作成 or 招待リンク案内）
- 所属済み: アプリランチャー（`AppCard` グリッド）+ `FamilyInfo`（メンバー・招待リンク共有）+ `TodaySchedule`（今日の予定サマリー）

### 買い物リスト（ShoppingPage）
- 複数リストをタブで切替。お気に入りリストを先頭表示、未購入数バッジ
- アイテムの追加 / チェック（購入日時記録）/ 重要フラグ / メモ / 追加者表示
- 家族間リアルタイム同期、毎朝の未購入アイテム Push 通知（`NotificationSettings` で時刻設定）

### 価格比較（PricePage）
- 店舗マスタ（並び順管理）× 商品ごとの価格表。最安値の把握が目的
- 価格は小数 2 桁対応、商品アイコン設定可

### 家計（BudgetPage)
- カテゴリ別の支出エントリ記録。メンバー・カテゴリのリレーション表示、リアルタイム同期

### お出かけリスト（PlacesPage）
- 行きたい場所の共有。Google Maps 連携（住所検索・緯度経度・地図表示）
- タグによる絞り込み検索、「今日はどこ行く？」提案導線

### 食べたいおかず（DishesPage）
- カテゴリ別の食べたい料理リスト。レシピ URL から OG 画像を自動取得（Edge Function `fetch-og-image` → Storage 永続化）
- 「作った」記録（cooked_at）、5 段階評価とレビュー

### 予定表（SchedulePage）
- 終日 / 時間指定イベント、メンバー割当て
- 勤務シフトモード（日勤 / 夜勤 / 明け / 休み）
- 変更履歴（誰がいつ何を変更したかの snapshot 保存）

### 在庫管理（InventoryPage）
- 日用品・食品の在庫。3 段階ステータス（ok / low / out）、賞味期限、カテゴリ・単位

### 旅行記録（TravelPage）
- 旅行（期間・都道府県・メモ）と、その中のアクティビティ（並び順付き）を記録

### 家族参加（JoinPage）
- 招待リンク（`/join/:familyId`）の受け口。1 ユーザー 1 家族制約の検証

## 新機能を追加するときのチェックリスト

1. [FEATURES.md](./FEATURES.md)（本ファイル）に行を追加
2. `App.jsx` にルート追加（保護ページは `<ProtectedRoute>` でラップ）
3. `src/pages/XxxPage.jsx` + `XxxPage.module.css` を作成（[COMPONENTS.md](./COMPONENTS.md) / [DESIGN.md](./DESIGN.md) 準拠）
4. HomePage のランチャーに `AppCard` を追加
5. 必要ならマイグレーション追加（[DATABASE.md](./DATABASE.md) のテンプレート使用、RLS 必須）
6. Realtime 同期が必要ならパブリケーション追加 + ページで購読
7. [CHANGELOG.md](../CHANGELOG.md) に追記
