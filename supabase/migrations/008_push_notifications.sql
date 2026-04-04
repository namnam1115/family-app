-- 重要フラグ
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS important boolean NOT NULL DEFAULT false;

-- プッシュ通知サブスクリプション（デバイスごと）
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分のサブスクリプションを管理" ON push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 家族通知設定
CREATE TABLE IF NOT EXISTS family_settings (
  family_id uuid PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  notification_enabled boolean NOT NULL DEFAULT false,
  notification_hour integer NOT NULL DEFAULT 8 CHECK (notification_hour >= 0 AND notification_hour <= 23),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE family_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは設定を参照可能" ON family_settings
  FOR SELECT TO authenticated USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは設定を変更可能" ON family_settings
  FOR ALL TO authenticated
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());
