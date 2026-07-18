# API.md — データアクセスと Edge Functions

本アプリに独自の REST API サーバーはない。データアクセスは **Supabase クライアント（`src/lib/supabase.js`）を直接使う**。認可はすべて RLS（[DATABASE.md](./DATABASE.md)）が担う。

## 環境変数

| 変数 | 用途 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon キー（RLS 前提で公開可） |
| `VITE_VAPID_PUBLIC_KEY` | Web Push 公開鍵（`src/lib/pushNotifications.js`） |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JS API（`src/utils/googleMaps.js`、お出かけリストの地図） |

Edge Functions 側（Supabase ダッシュボードで設定）: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `SUPABASE_SERVICE_ROLE_KEY`。

## クエリの標準パターン

### 取得（SELECT）

```js
const { data, error } = await supabase
  .from('shopping_lists')
  .select('id, name, created_at, is_favorite')   // カラムを明示（* は極力避ける）
  .eq('family_id', familyMember.family_id)        // RLS で守られていても明示する
  .order('created_at', { ascending: false })
if (error) { console.error('リスト取得エラー:', error); return }
```

- リレーション取得は埋め込み構文: `select('*, budget_categories(name), family_members(id, name)')`
- FK が複数あるときは明示: `select('*, added_by_member:family_members!wish_places_added_by_fkey(id, name)')`
- 単一行は `.maybeSingle()`（0 件が正常系のとき）/ `.single()`（必ず 1 件のとき）

### 更新は楽観的更新 + ロールバック

UI を先に更新し、Supabase の `error` 時に元へ戻す（`ShoppingPage.handleToggleFavorite` が参照実装）:

```js
setItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i))  // 1. 先に UI 反映
const { error } = await supabase.from('shopping_items').update({ checked }).eq('id', id)
if (error) {
  console.error('更新エラー:', error)
  setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))  // 2. 失敗時ロールバック
}
```

### Realtime 購読

ページの `useEffect` でチャンネルを作り、**必ずクリーンアップで解除**する:

```js
useEffect(() => {
  if (!familyMember?.family_id) return
  const channel = supabase
    .channel('shopping_lists_changes')  // チャンネル名は「テーブル名_changes」or「テーブル名_rt」
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_lists',
        filter: `family_id=eq.${familyMember.family_id}` },
      fetchLists)
    .subscribe()
  return () => supabase.removeChannel(channel)
}, [familyMember?.family_id, fetchLists])
```

- 購読対象テーブルは realtime パブリケーションに追加されている必要がある（[DATABASE.md](./DATABASE.md) の Realtime 列参照）
- コールバックは差分適用ではなく**再フェッチ**（`fetchXxx`）に統一している。データ量が小さい前提のシンプル設計

## Edge Functions（`supabase/functions/`、Deno / TypeScript）

| 関数 | 呼び出し元 | 役割 |
|---|---|---|
| `fetch-og-image` | クライアント（`supabase.functions.invoke('fetch-og-image', { body: { url } })`、DishesPage） | URL から OG 画像を取得し `dish-thumbnails` バケットへ永続保存（期限付き URL 対策）。http/https のみ許可する URL バリデーションあり |
| `send-shopping-notifications` | スケジュール実行（cron） | `family_settings.notification_hour`（JST）に一致する家族へ、未チェックの買い物アイテムを Web Push 通知。service_role で RLS をバイパス |

### Edge Function を書くときの規約

- CORS ヘッダー（`Access-Control-Allow-Origin` 等）と `OPTIONS` 応答を必ず実装する（既存 2 関数のパターンを踏襲）
- 入力は必ずバリデーションし、エラーは `{ error: string }` JSON + 適切なステータスコードで返す
- service_role キーは Edge Function 内のみ。クライアントに露出させない
- デプロイは `supabase functions deploy <name>`（手動）。完了報告にデプロイ要否を明記する

## Push 通知（`src/lib/pushNotifications.js`）

- `isPushSupported()` / `getPushStatus()` / `subscribeToPush(familyId, userId)` / `unsubscribeFromPush()` を提供
- 購読は `push_subscriptions` テーブルにデバイスごとに保存（`UNIQUE(user_id, endpoint)`）
- 受信側は `public/sw-push.js`（vite-plugin-pwa の Workbox に `importScripts` で注入）

## 外部 API

- **Google Maps JS API**: `src/utils/googleMaps.js` の `loadGoogleMapsScript()` でシングルトンロード。`loading=async` + `importLibrary()` で必要ライブラリのみ読み込む。新たに地図機能を使う場合もこの関数を経由する
- 新しい外部 API の追加は原則 Edge Function 経由にする（API キー秘匿・CORS 回避のため）
