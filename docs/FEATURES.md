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
| `/schedule` | SchedulePage 予定表 | 必要 | schedule_events, schedule_event_history, schedule_event_comments |
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
- 場所名（タイトル）タップで、モーダル内に簡易ブラウザ（Google 検索を iframe 埋め込み）を表示し、その場で下調べ可能。埋め込みが不可の環境では外部ブラウザで開くフォールバックあり

### 食べたいおかず（DishesPage）
- カテゴリ別の食べたい料理リスト。レシピ URL から OG 画像を自動取得（Edge Function `fetch-og-image` → Storage 永続化）
- 「作った」記録（cooked_at）、5 段階評価とレビュー

### 予定表（SchedulePage）
- 表示: 月 / 週（タイムグリッド・ドラッグ移動リサイズ）/ リスト（アジェンダ）の3ビュー
- 月/リストは左右スワイプで前後移動
- 終日 / 時間指定イベント、メンバー割当て
- カテゴリ（仕事/学校/病院/家事/行事/遊び）で色分け（カテゴリ色 > メンバー色）
- 場所（Google マップリンク）、メモ
- 繰り返し予定（毎日/毎週/毎月/毎年 + 終了日、月末はクランプ）。表示範囲内でクライアント展開
  - 「すべて」編集/削除＝シリーズ全体、「この回だけ削除」＝除外日追加、「この回だけ変更」＝除外日＋単発予定として切り出し
- リマインダー通知（時間指定=10分〜1日前 / 終日=当日朝〜2日前）。繰り返し・終日にも対応（Edge Function `send-schedule-reminders`、`schedule_reminder_log` でオカレンス単位の二重送信防止）
- 予定の追加/更新/コメント時に家族へ即時 push 通知（Edge Function `notify-schedule-change`、本人デバイス除外）
  - ユーザー毎に変更通知 ON/OFF（ヘッダー⋯メニュー、`schedule_notify_prefs`）
- アクセシビリティ: モーダルは Esc で閉じる、月セルはキーボード操作可（Enter/Space）
- コメント未読バッジ（自分以外の新着コメントを赤ドット表示、`schedule_event_reads` で既読管理）
- 日本の祝日表示（`src/lib/holidays.js`、2024〜2027年、赤字＋祝日名）
- 複数日の終日予定は月表示で横帯連結。1日あたり表示件数はセル高さに応じて可変
- 年月ジャンプ（月ラベルタップでピッカー）
- 入力補助: タイトル履歴サジェスト / 所要時間チップ(30分〜3時間) / 「続けて追加」
- デイビュー: 日付タップ／`+N件`でその日の全予定を一覧表示
- 予定詳細ビュー（閲覧）→ 編集を分離
- 予定ごとのコメント（家族間コミュニケーション、realtime）
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
