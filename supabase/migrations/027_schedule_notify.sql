-- ============================================================
-- 027_schedule_notify.sql  通知コントロール & リマインダー拡張
-- ============================================================

-- ユーザー毎の「変更通知」ON/OFF（通知疲れ対策）
CREATE TABLE IF NOT EXISTS schedule_notify_prefs (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id        uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  notify_on_change boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE schedule_notify_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分の通知設定を管理" ON schedule_notify_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- リマインダー送信ログ（繰り返し予定のオカレンス単位で二重送信を防止）
CREATE TABLE IF NOT EXISTS schedule_reminder_log (
  event_id        uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, occurrence_date)
);

-- edge function（service role）専用。RLS 有効・ポリシー無しでクライアントからは不可視。
ALTER TABLE schedule_reminder_log ENABLE ROW LEVEL SECURITY;
