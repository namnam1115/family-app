# COMPONENTS.md — コンポーネント設計

## 構成の原則

- **ページ = 機能のコンテナ** (`src/pages/`)。データ取得・Realtime 購読・状態管理を担う
- **コンポーネント = 表示と局所的な操作** (`src/components/`)。データは props で受け取る
- 1 ページ内でしか使わない小さな部品（モーダル等）は、まずページファイル内のローカルコンポーネントとして定義してよい（例: `ShoppingPage` の `CreateListModal`）。**2 ページ目で必要になったら `src/components/` へ昇格**させる
- スタイルは同名の CSS Module を隣に置く（`Foo.jsx` + `Foo.module.css`）

## 既存コンポーネント（`src/components/`）

| コンポーネント | 役割 | 使用箇所 |
|---|---|---|
| `ProtectedRoute` | 未認証 / 家族未所属ユーザーのリダイレクト | `App.jsx` の保護ルート |
| `AppCard` | ホームのアプリランチャーカード | HomePage |
| `FamilyInfo` | 家族情報・メンバー表示・招待リンク | HomePage |
| `GroupSetup` | 家族グループ作成 / 参加フォーム | HomePage |
| `TodaySchedule` | 今日の予定サマリー | HomePage |
| `NotificationSettings` | Push 通知の購読・時刻設定モーダル | ShoppingPage |
| `ShoppingListPanel` | 買い物リストのパネル | Shopping 系 |
| `ShoppingItemList` | アイテム一覧・追加・チェック | ShoppingPage |
| `LoadingSpinner` | ローディング表示 | 各所 |
| `BottomNav` | アプリ横断のグローバルナビ（下部タブバー） | 全ページ（`.page` の最後の子として配置） |
| `ConfirmDialog` | 破壊的操作の確認ダイアログ（削除など） | Shopping / Places / Inventory / Travel ほか |
| `EmptyState` | 空データ時の「アイコン＋一言＋主アクション」 | ShoppingPage ほか |
| `Toast` | 画面下部の一時通知（失敗通知・任意アクション） | ShoppingPage ほか |
| `OfflineBanner` | オフライン時の上部バナー（アプリ全体で 1 つ） | `App.jsx` |

## 共通化ロードマップ

現状、モーダル・ボタン・空状態などは各ページに **CSS Module パターンとして重複**している（`styles.overlay` / `styles.modal` / `styles.saveBtn` 等の同型実装）。方針:

- **すぐに全部共通化しない。** 動いている UI の一括置換はデグレリスクが利益を上回る
- 新規実装・既存改修で同じ部品が **3 箇所目**に必要になったタイミングで、以下の候補名で `src/components/` に抽出する

| 候補 | 抽出元パターン | 備考 |
|---|---|---|
| `Modal` | 各ページの overlay + modal + ヘッダー + × ボタン | 背景クリック / × で閉じる。参照実装: `ShoppingPage.CreateListModal` |
| `BottomSheet` | モバイル向け選択 UI | `slideUp` アニメーション |
| `Button` | saveBtn / cancelBtn / dangerBtn | variant: primary / ghost / danger |
| `Input` / `SearchBar` | modalInput / 検索バー | 16px フォント維持（iOS ズーム防止） |
| `Card` | surface + radius-lg + shadow | |
| `EmptyState` | 絵文字 + 案内文 | 参照実装: `ShoppingPage` の empty |
| `Chip` / `Badge` | タグ表示（PlacesPage）・件数バッジ | |
| `Avatar` | メンバー表示 | |
| `ErrorView` | エラー時の再試行 UI | 現状ほぼ未整備。新規実装から導入可 |

抽出したらこの表を「既存コンポーネント」へ移動して更新すること。

## コンポーネントを書くときのルール

1. **関数コンポーネント + named `export default`**。クラスコンポーネント禁止
2. **props は分割代入**で受け取り、コールバックは `onXxx` 命名（`onClose`, `onSubmit`, `onToggleFavorite`）
3. **データ取得はページに置く**のが基本。コンポーネントが自分でフェッチするのは、その機能が自己完結している場合のみ（例: `ShoppingItemList` は `listId` を受けて自分でアイテムを取得・購読する）
4. **状態は最も近い場所に**: グローバル状態は `AuthContext` のみ。新たな Context / 状態管理ライブラリの追加は要相談
5. **表示ゆらぎの防御**: `familyMember?.name || familyMember?.email || '名前なし'` のように null を UI に漏らさない
6. **ローディング / 空 / エラーの 3 状態**を必ず考慮する。データゼロで真っ白な画面にしない
7. スタイルの詳細は [DESIGN.md](./DESIGN.md)、命名は [STYLE_GUIDE.md](./STYLE_GUIDE.md)

## ディレクトリ構成（現状と拡張方針)

```
src/
├── App.jsx              # ルーティング定義（新ページはここに追加）
├── main.jsx             # エントリポイント
├── index.css            # デザイントークン・グローバルスタイル（安易に触らない）
├── contexts/
│   └── AuthContext.jsx  # 認証・家族状態（唯一のグローバル状態）
├── pages/               # ルーティング単位。Foo.jsx + Foo.module.css
├── components/          # 複数ページで使う共通コンポーネント
├── hooks/               # （将来）useXxx カスタムフック。3 箇所目の重複ロジックから
├── lib/                 # 外部サービスクライアント（supabase, pushNotifications）
└── utils/               # 純粋なユーティリティ（googleMaps）
```

- 新しい階層（`features/` 等）への再編成は行わない。この構成の中で増やす
- ページ数がさらに増えて破綻し始めたら、その時に再編成を**提案**する（勝手にやらない）
