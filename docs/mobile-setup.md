# iOS / Android アプリ 環境構築ガイド

このドキュメントでは、家族プラットフォームを iOS / Android ネイティブアプリとしてビルド・配布するための環境構築手順を説明します。

---

## 構成概要

| レイヤー | 技術 |
|---------|------|
| フレームワーク | React 19 + Vite (既存 Web コードをそのまま利用) |
| ネイティブラッパー | [Capacitor](https://capacitorjs.com/) v8 |
| バックエンド | Supabase (既存) |
| Push 通知 (ネイティブ) | Firebase Cloud Messaging (FCM) |
| Push 通知 (Web) | Web Push / VAPID (既存、変更なし) |

---

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Node.js | 18 以上 | ビルド |
| Xcode | 15 以上 | iOS ビルド (macOS 必須) |
| Android Studio | Hedgehog 以上 | Android ビルド |
| Java JDK | 17 以上 | Android ビルド |
| Supabase CLI | 最新 | マイグレーション適用 |

---

## 1. リポジトリのセットアップ

```bash
git clone <repo-url>
cd family-app
npm install
```

---

## 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

`.env` に以下を設定してください。

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key   # Web Push 用
VITE_GOOGLE_MAPS_API_KEY=your-maps-api-key    # PlacesPage 用
```

---

## 3. Firebase プロジェクトのセットアップ (ネイティブ Push 通知に必須)

### 3-1. Firebase プロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成
2. 「プロジェクトの設定」→「全般」タブ → アプリを追加

### 3-2. Android アプリを登録

- パッケージ名: `com.familyapp.app`
- `google-services.json` をダウンロードして `android/app/google-services.json` に配置

### 3-3. iOS アプリを登録

- バンドル ID: `com.familyapp.app`
- `GoogleService-Info.plist` をダウンロードして `ios/App/App/GoogleService-Info.plist` に配置

### 3-4. APNs 認証キーを Firebase に登録 (iOS のみ)

1. [Apple Developer](https://developer.apple.com/) で APNs 認証キー (.p8) を生成
2. Firebase Console →「プロジェクトの設定」→「Cloud Messaging」→「APNs 認証キー」にアップロード

---

## 4. Supabase のセットアップ

### 4-1. データベースマイグレーション

マイグレーションを順番に適用します。

```bash
# Supabase CLI を使う場合
supabase db push

# または Supabase ダッシュボードの SQL Editor で以下を順番に実行:
# 001_initial_schema.sql
# 002_rls_policies.sql
# 003_realtime.sql
# 004_fix_families_policy.sql
# 005_add_checked_at.sql
# 006_price_comparison.sql
# 007_price_stores.sql
# 008_push_notifications.sql
# 009_dishes.sql
# 010_schedule.sql
# 011_shift_mode.sql
# 012_schedule_history.sql
# 013_capacitor_push.sql  ← Capacitor 対応追加分
```

`013_capacitor_push.sql` は `push_subscriptions` テーブルに以下を追加します。

```sql
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;
```

### 4-2. Edge Function の環境変数を設定

Supabase ダッシュボード →「Edge Functions」→「send-shopping-notifications」→「Secrets」に追加します。

| キー | 値 | 説明 |
|------|-----|------|
| `VAPID_PUBLIC_KEY` | VAPID 公開鍵 | Web Push 用 (既存) |
| `VAPID_PRIVATE_KEY` | VAPID 秘密鍵 | Web Push 用 (既存) |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Web Push 用 (既存) |
| `FIREBASE_PROJECT_ID` | Firebase プロジェクト ID | ネイティブ Push 用 |
| `FIREBASE_SERVICE_ACCOUNT_B64` | サービスアカウント JSON の Base64 | ネイティブ Push 用 |

**`FIREBASE_SERVICE_ACCOUNT_B64` の生成方法:**

```bash
# Firebase Console →「プロジェクトの設定」→「サービスアカウント」→「新しい秘密鍵を生成」
# ダウンロードした JSON を base64 エンコード
base64 -i path/to/service-account.json | tr -d '\n'
```

### 4-3. Google OAuth の設定

Supabase ダッシュボード →「Authentication」→「Providers」→「Google」を有効化し、
以下のリダイレクト URL を **追加** します。

```
com.familyapp.app://login-callback
```

(既存の `https://your-app.supabase.co/auth/v1/callback` に加えて追加)

---

## 5. ネイティブプロジェクトの生成

### 5-1. Web アセットをビルド

```bash
npm run build
```

### 5-2. Capacitor プロジェクトを追加・同期

```bash
# Android プロジェクト生成 (初回のみ)
npx cap add android

# iOS プロジェクト生成 (初回のみ、macOS 必須)
npx cap add ios

# ビルド成果物とプラグインを同期 (build 後に毎回実行)
npx cap sync
```

### 5-3. Firebase 設定ファイルを配置

```bash
# Android
cp path/to/google-services.json android/app/google-services.json

# iOS
cp path/to/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
```

---

## 6. ネイティブ設定 (初回のみ)

### 6-1. Android: URL スキームの設定

`android/app/src/main/AndroidManifest.xml` の `<activity>` に以下を追加します。

```xml
<!-- Google OAuth deep link -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.familyapp.app" />
</intent-filter>
```

### 6-2. iOS: URL スキームの設定

Xcode で `ios/App/App/Info.plist` を開き、`CFBundleURLTypes` に追加します。

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.familyapp.app</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.familyapp.app</string>
        </array>
    </dict>
</array>
```

---

## 7. ビルドと実行

### Android

```bash
# Android Studio で開く
npx cap open android

# または CLI でエミュレータ実行
npx cap run android
```

Android Studio で「Run」ボタンを押すか、`Build > Generate Signed Bundle / APK` から配布用 AAB をビルドします。

### iOS

```bash
# Xcode で開く (macOS 必須)
npx cap open ios

# または CLI でシミュレータ実行
npx cap run ios
```

Xcode で「Product > Archive」から配布用 IPA を作成し、App Store Connect へアップロードします。

---

## 8. 開発時のワークフロー

Web コードを変更した場合は必ず以下を実行してから実機/エミュレータで確認します。

```bash
npm run build && npx cap sync
```

| コマンド | 用途 |
|---------|------|
| `npm run dev` | Web ブラウザで開発 (Capacitor なし) |
| `npm run build && npx cap sync` | ネイティブアプリに反映 |
| `npx cap open android` | Android Studio を開く |
| `npx cap open ios` | Xcode を開く |
| `npx cap run android` | Android エミュレータで実行 |
| `npx cap run ios` | iOS シミュレータで実行 |

---

## 9. Push 通知のテスト

### Web Push のテスト (既存)

ブラウザで通知を許可してから、Supabase ダッシュボードで Edge Function を手動実行します。

### ネイティブ Push のテスト

実機が必要です (エミュレータは FCM を受信できません)。

```bash
# Edge Function を curl で手動トリガー
curl -X POST https://your-project.supabase.co/functions/v1/send-shopping-notifications \
  -H "Authorization: Bearer <anon-key>"
```

DB の `push_subscriptions` テーブルで `fcm_token` が登録されていることを確認してから実行してください。

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| OAuth ログイン後にアプリに戻らない | URL スキームが未設定 | 手順 6 を確認 |
| Push 通知が届かない (Android) | `google-services.json` の配置ミス | 手順 5-3 を確認 |
| Push 通知が届かない (iOS) | APNs キーが Firebase 未登録 | 手順 3-4 を確認 |
| `npx cap sync` がエラー | `npm run build` 未実行 | `dist/` を生成してから再実行 |
| ノッチ部分に UI が隠れる | `viewport-fit=cover` が効いていない | `index.html` の viewport 設定を確認 |
