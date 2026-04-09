-- 004_capacitor_push.sql
-- Capacitor ネイティブアプリ対応: push_subscriptions にプラットフォーム情報を追加

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- platform の値: 'web' | 'android' | 'ios'
COMMENT ON COLUMN push_subscriptions.platform IS 'Push 配信プラットフォーム: web (Web Push/VAPID), android (FCM), ios (FCM→APNs)';
COMMENT ON COLUMN push_subscriptions.fcm_token IS 'Android/iOS ネイティブアプリの FCM 登録トークン';

-- 既存の web サブスクリプションは platform = 'web' のままでOK
-- ネイティブ用の一意制約は user_id + endpoint で引き続き管理
-- (ネイティブの endpoint は "native:{platform}:{userId}" 形式)
