-- ============================================================
-- 024_schedule_enhance.sql  スケジュール強化
--   場所 / カテゴリ / 繰り返し / リマインダー を追加
-- ============================================================

ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS location        text,
  ADD COLUMN IF NOT EXISTS category        text,
  ADD COLUMN IF NOT EXISTS recurrence      text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_until date,
  ADD COLUMN IF NOT EXISTS reminder_minutes integer
    CHECK (reminder_minutes IS NULL OR reminder_minutes >= 0),
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- リマインダー送信対象を高速に絞り込むための部分インデックス
CREATE INDEX IF NOT EXISTS idx_schedule_events_reminder
  ON schedule_events (start_datetime)
  WHERE reminder_minutes IS NOT NULL AND reminder_sent_at IS NULL;
