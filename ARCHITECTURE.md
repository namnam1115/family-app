# システム構成図

## 全体アーキテクチャ

```mermaid
graph TB
    subgraph Client["クライアント (PWA)"]
        Browser["ブラウザ / スマホ"]
        SW["Service Worker\n(Push通知受信)"]
    end

    subgraph Vercel["Vercel (ホスティング)"]
        React["React + Vite\nSPA / PWA"]
    end

    subgraph Supabase["Supabase"]
        Auth["Supabase Auth\n(認証)"]
        DB["PostgreSQL\n(RLS有効)"]
        Realtime["Supabase Realtime\n(WebSocket)"]
        Edge["Edge Functions\nsend-shopping-notifications"]
    end

    subgraph External["外部サービス"]
        Google["Google OAuth"]
        WebPush["Web Push API\n(VAPID)"]
    end

    GitHub["GitHub"] -->|CI/CD| Vercel

    Browser -->|HTTPS| React
    React -->|Googleログイン| Auth
    Auth -->|OAuth| Google
    React -->|データ取得・更新| DB
    React -->|リアルタイム同期| Realtime
    React -->|Push通知登録| DB
    Edge -->|スケジュール実行| WebPush
    WebPush -->|通知配信| SW
    SW --> Browser
```

---

## ページ構成・ルーティング

```mermaid
graph LR
    Root["/\nホーム画面\n(アプリ一覧)"]
    Shopping["/shopping\n買い物リスト"]
    Price["/price\n価格比較"]
    Join["/join/:familyId\n招待リンク"]

    Root --> Shopping
    Root --> Price
    Root --> Join
```

| パス | ページ | 認証要否 |
|------|--------|----------|
| `/` | ホーム（アプリ一覧） | 不要 |
| `/shopping` | 買い物リスト | 必要 |
| `/price` | 価格比較 | 必要 |
| `/join/:familyId` | 家族参加（招待リンク） | 不要 |

---

## 認証・家族グループ フロー

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant App as React App
    participant Auth as Supabase Auth
    participant Google as Google OAuth
    participant DB as PostgreSQL

    U->>App: ログインボタン押下
    App->>Auth: signInWithOAuth(google)
    Auth->>Google: OAuth リダイレクト
    Google-->>Auth: 認証トークン
    Auth-->>App: セッション確立

    App->>DB: family_members 確認
    alt 家族未所属
        DB-->>App: レコードなし
        App->>U: グループ作成 or 招待リンクで参加
    else 家族所属済み
        DB-->>App: family_id 返却
        App->>U: ホーム画面へ
    end
```

---

## データベース設計

```mermaid
erDiagram
    families {
        uuid id PK
        text name
        timestamp created_at
    }

    family_members {
        uuid id PK
        uuid family_id FK
        uuid user_id UK
        text name
        text email
        timestamp joined_at
    }

    shopping_lists {
        uuid id PK
        uuid family_id FK
        text name
        text created_by
        timestamp created_at
    }

    shopping_items {
        uuid id PK
        uuid list_id FK
        text name
        text memo
        text added_by
        boolean checked
        boolean important
        timestamp created_at
    }

    price_stores {
        uuid id PK
        uuid family_id FK
        text name
        integer sort_order
    }

    price_items {
        uuid id PK
        uuid family_id FK
        text store_name
        text product_name
        integer price
        text note
        text updated_by
        timestamp updated_at
    }

    push_subscriptions {
        uuid id PK
        uuid user_id FK
        uuid family_id FK
        text endpoint
        text p256dh
        text auth
        timestamp created_at
    }

    family_settings {
        uuid family_id PK_FK
        boolean notification_enabled
        integer notification_hour
        timestamp updated_at
    }

    families ||--o{ family_members : "has"
    families ||--o{ shopping_lists : "has"
    families ||--o{ price_stores : "has"
    families ||--o{ price_items : "has"
    families ||--o{ push_subscriptions : "has"
    families ||--|| family_settings : "has"
    shopping_lists ||--o{ shopping_items : "contains"
```

---

## フロントエンド コンポーネント構成

```mermaid
graph TD
    App["App.jsx\n(Router)"]

    App --> AuthProvider["AuthProvider\n(Context)"]
    App --> PR["ProtectedRoute"]

    AuthProvider --> HP["HomePage"]
    AuthProvider --> JP["JoinPage"]
    PR --> SP["ShoppingPage"]
    PR --> PP["PricePage"]

    HP --> AppCard["AppCard"]
    HP --> FamilyInfo["FamilyInfo"]
    HP --> GroupSetup["GroupSetup"]
    HP --> NotifSettings["NotificationSettings"]

    SP --> SLP["ShoppingListPanel"]
    SLP --> SIL["ShoppingItemList"]
```

---

## Push通知 フロー

```mermaid
sequenceDiagram
    participant U as ユーザー (ブラウザ)
    participant SW as Service Worker
    participant DB as Supabase DB
    participant Edge as Edge Function
    participant Push as Web Push API

    U->>SW: 通知許可
    SW->>DB: push_subscriptions に登録
    U->>DB: family_settings で通知時刻設定

    Note over Edge: スケジュール実行 (設定時刻)
    Edge->>DB: push_subscriptions + 未チェック items 取得
    Edge->>Push: Web Push 送信 (VAPID)
    Push->>SW: Push イベント
    SW->>U: 通知表示
```

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 18 + Vite |
| PWA | vite-plugin-pwa + Service Worker |
| 認証 | Supabase Auth (Google OAuth) |
| データベース | Supabase (PostgreSQL) + RLS |
| リアルタイム | Supabase Realtime (WebSocket) |
| バックエンド | Supabase Edge Functions (Deno) |
| Push通知 | Web Push API (VAPID) |
| ホスティング | Vercel (GitHub 自動デプロイ) |

---

## セキュリティ設計

- **Row Level Security (RLS)**: 全テーブルに適用。`get_my_family_id()` ヘルパー関数で家族スコープを強制
- **認証**: Supabase Auth セッションによる JWT 検証
- **招待リンク**: `families` テーブルの SELECT を認証済みユーザー全体に許可（参加フローのため）
- **Push通知**: VAPID キーによる署名、エンドポイントはユーザー自身のみ管理可能
